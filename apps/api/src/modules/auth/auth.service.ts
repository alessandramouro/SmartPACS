import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { User, UserStatus } from '@prisma/client';
import {
  LoginRequest,
  LoginResponse,
  JwtPayload,
  MfaSetupResponse,
  AuthUser,
} from '@smartpacs/types';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });

    if (!user) return null;

    const isLocked =
      user.lockedUntil && user.lockedUntil > new Date();
    if (isLocked) {
      throw new ForbiddenException(
        `Account locked until ${user.lockedUntil?.toISOString()}. Too many failed attempts.`,
      );
    }

    const isValid = await argon2.verify(user.passwordHash, password);

    if (!isValid) {
      await this.incrementFailedLoginAttempts(user);
      return null;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    return user;
  }

  async login(
    loginDto: LoginRequest,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponse> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        ipAddress,
        metadata: { email: loginDto.email },
        success: false,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(
        `Account is ${user.status.toLowerCase()}. Contact support.`,
      );
    }

    // MFA check
    if (user.mfaEnabled) {
      if (!loginDto.mfaCode) {
        return {
          accessToken: '',
          refreshToken: '',
          expiresIn: 0,
          tokenType: 'Bearer',
          user: this.toAuthUser(user),
          requiresMfa: true,
          mfaChallenge: user.id,
        };
      }

      const isValidMfa = authenticator.verify({
        token: loginDto.mfaCode,
        secret: user.mfaSecret!,
      });

      if (!isValidMfa) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    if (user.mustChangePassword) {
      const token = uuidv4();
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + 2);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: token, passwordResetExpiry: expiry },
      });

      return {
        accessToken: '',
        refreshToken: '',
        expiresIn: 0,
        tokenType: 'Bearer',
        user: this.toAuthUser(user),
        requiresPasswordChange: true,
        passwordResetToken: token,
      };
    }

    const sessionId = uuidv4();
    const tokens = await this.generateTokens(user, sessionId);

    // Persist session
    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() +
        (loginDto.rememberMe
          ? 30
          : parseInt(this.configService.get('auth.sessionDurationDays', '7'), 10)),
    );

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        sessionToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        loginCount: { increment: 1 },
      },
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      clinicId: user.clinicId ?? undefined,
      userId: user.id,
      action: 'LOGIN',
      ipAddress,
      success: true,
    });

    this.eventEmitter.emit('auth.login', { userId: user.id, tenantId: user.tenantId });

    return {
      ...tokens,
      tokenType: 'Bearer',
      user: this.toAuthUser(user),
    };
  }

  async refreshTokens(refreshToken: string): Promise<LoginResponse> {
    try {
      this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('auth.jwtRefreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const session = await this.prisma.userSession.findFirst({
      where: { refreshToken, isRevoked: false },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    const user = session.user;
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }

    const sessionId = uuidv4();
    const tokens = await this.generateTokens(user, sessionId);

    // Rotate session
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        isRevoked: true,
      },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        sessionToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        expiresAt,
      },
    });

    return {
      ...tokens,
      tokenType: 'Bearer',
      user: this.toAuthUser(user),
    };
  }

  async logout(userId: string, accessToken: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, sessionToken: accessToken },
      data: { isRevoked: true },
    });

    await this.auditService.log({
      userId,
      action: 'LOGOUT',
      success: true,
    });
  }

  async setupMfa(userId: string): Promise<MfaSetupResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.role !== 'SUPER_ADMIN') {
      const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
      const features = tenant.features as Record<string, boolean>;
      if (!features.mfa) {
        throw new ForbiddenException('MFA não está disponível no plano deste tenant');
      }
    }

    const secret = authenticator.generateSecret(32);
    const otpAuthUrl = authenticator.keyuri(user.email, 'SmartPACS', secret);
    const qrCodeUrl = await qrcode.toDataURL(otpAuthUrl);
    const backupCodes = Array.from({ length: 8 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase(),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: secret,
        mfaBackupCodes: backupCodes,
      },
    });

    return { secret, qrCodeUrl, backupCodes };
  }

  async enableMfa(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecret) throw new BadRequestException('MFA setup not initiated');

    const isValid = authenticator.verify({ token: code, secret: user.mfaSecret });
    if (!isValid) throw new BadRequestException('Invalid MFA code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    await this.auditService.log({
      userId,
      tenantId: user.tenantId,
      action: 'MFA_ENABLED',
      success: true,
    });
  }

  async disableMfa(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabled) throw new BadRequestException('MFA is not enabled');

    const isValid = authenticator.verify({ token: code, secret: user.mfaSecret! });
    if (!isValid) throw new BadRequestException('Invalid MFA code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    });

    await this.auditService.log({
      userId,
      tenantId: user.tenantId,
      action: 'MFA_DISABLED',
      success: true,
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });

    // Always respond 200 to prevent email enumeration
    if (!user) return;

    const token = uuidv4();
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 2);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    this.eventEmitter.emit('auth.password_reset_requested', {
      userId: user.id,
      email: user.email,
      name: user.name,
      token,
    });
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiry: { gt: new Date() },
        deletedAt: null,
      },
    });

    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await argon2.hash(newPassword, this.configService.get('auth.argon2Options'));

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        mustChangePassword: false,
      },
    });

    // Revoke all sessions
    await this.prisma.userSession.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    });

    await this.auditService.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'PASSWORD_RESET',
      success: true,
    });
  }

  private async generateTokens(
    user: User,
    sessionId: string,
  ): Promise<Pick<LoginResponse, 'accessToken' | 'refreshToken' | 'expiresIn'>> {
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      role: user.role as any,
      tenantId: user.tenantId,
      clinicId: user.clinicId ?? undefined,
      permissions: permissions as any,
      sessionId,
    };

    const accessExpiresIn = this.configService.get<string>('auth.jwtAccessExpiresIn', '15m');
    const refreshExpiresIn = this.configService.get<string>('auth.jwtRefreshExpiresIn', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('auth.jwtSecret'),
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(
        { sub: user.id, sessionId, type: 'refresh' },
        {
          secret: this.configService.get<string>('auth.jwtRefreshSecret'),
          expiresIn: refreshExpiresIn,
        },
      ),
    ]);

    const expiresInSeconds = this.parseExpiry(accessExpiresIn);

    return { accessToken, refreshToken, expiresIn: expiresInSeconds };
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900;
    const [, num, unit] = match;
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return parseInt(num) * (multipliers[unit] || 1);
  }

  private toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as any,
      tenantId: user.tenantId,
      clinicId: user.clinicId ?? undefined,
      permissions: Array.isArray(user.permissions) ? (user.permissions as any) : [],
      mfaEnabled: user.mfaEnabled,
    };
  }

  private async incrementFailedLoginAttempts(user: User): Promise<void> {
    const maxAttempts = this.configService.get<number>('auth.maxFailedLoginAttempts', 5);
    const lockoutMinutes = this.configService.get<number>('auth.lockoutDurationMinutes', 30);

    const newCount = user.failedLoginCount + 1;
    const lockedUntil = newCount >= maxAttempts
      ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
      : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: newCount, lockedUntil },
    });
  }
}
