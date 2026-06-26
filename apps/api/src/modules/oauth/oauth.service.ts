import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@smartpacs/types';

import { EncryptionUtil } from '../../common/utils/encryption.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'CLINIC_ADMIN'];

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly encKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.encKey = configService.get<string>('app.encryptionKey', '');
  }

  private assertAdminRole(user: JwtPayload) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Apenas Super Admin e Administradores podem gerenciar conexões OAuth');
    }
  }

  // ─── Google ─────────────────────────────────────────────────

  getGoogleAuthUrl(state: string): string {
    const clientId = this.configService.get<string>('oauth.googleClientId');
    const redirectUri = this.configService.get<string>('oauth.googleRedirectUri');
    if (!clientId || clientId.startsWith('your-')) {
      throw new BadRequestException('Google OAuth não está configurado. Acesse Configurações → Credenciais OAuth para inserir o Client ID e Secret.');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri!,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async handleGoogleCallback(code: string, state: string) {
    const clientId = this.configService.get<string>('oauth.googleClientId');
    const clientSecret = this.configService.get<string>('oauth.googleClientSecret');
    const redirectUri = this.configService.get<string>('oauth.googleRedirectUri');

    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { tenantId, clinicId, destinationId } = stateData;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId!, client_secret: clientSecret!,
        redirect_uri: redirectUri!, grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json() as any;
    if (tokens.error) throw new BadRequestException(`Google OAuth error: ${tokens.error_description}`);

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userRes.json() as any;

    const existing = await this.prisma.oAuthToken.findFirst({
      where: { tenantId, provider: 'GOOGLE', accountEmail: userInfo.email },
    });

    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    const tokenData = {
      tenantId,
      clinicId: clinicId ?? null,
      destinationId: destinationId ?? null,
      provider: 'GOOGLE' as const,
      accessToken: this.encKey ? EncryptionUtil.encrypt(tokens.access_token, this.encKey) : tokens.access_token,
      refreshToken: tokens.refresh_token
        ? (this.encKey ? EncryptionUtil.encrypt(tokens.refresh_token, this.encKey) : tokens.refresh_token)
        : null,
      expiresAt,
      scope: tokens.scope,
      accountEmail: userInfo.email,
      accountId: userInfo.id,
    };

    let result;
    if (existing) {
      result = await this.prisma.oAuthToken.update({ where: { id: existing.id }, data: tokenData });
    } else {
      result = await this.prisma.oAuthToken.create({ data: tokenData });
    }

    await this.auditService.log({
      tenantId,
      clinicId: clinicId ?? undefined,
      action: 'STORAGE_CONFIGURED',
      entityType: 'OAuthToken',
      entityId: result.id,
      newValues: { provider: 'GOOGLE', accountEmail: userInfo.email, destinationId },
      success: true,
    });

    return result;
  }

  // ─── Microsoft ──────────────────────────────────────────────

  getMicrosoftAuthUrl(state: string): string {
    const clientId = this.configService.get<string>('oauth.microsoftClientId');
    const redirectUri = this.configService.get<string>('oauth.microsoftRedirectUri');
    const tenantMsft = this.configService.get<string>('oauth.microsoftTenantId', 'common');
    if (!clientId || clientId.startsWith('your-')) {
      throw new BadRequestException('Microsoft OAuth não está configurado. Acesse Configurações → Credenciais OAuth para inserir o Client ID e Secret.');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri!,
      response_type: 'code',
      scope: 'Files.ReadWrite.All User.Read offline_access',
      state,
    });
    return `https://login.microsoftonline.com/${tenantMsft}/oauth2/v2.0/authorize?${params}`;
  }

  async handleMicrosoftCallback(code: string, state: string) {
    const clientId = this.configService.get<string>('oauth.microsoftClientId');
    const clientSecret = this.configService.get<string>('oauth.microsoftClientSecret');
    const redirectUri = this.configService.get<string>('oauth.microsoftRedirectUri');
    const tenantMsft = this.configService.get<string>('oauth.microsoftTenantId', 'common');

    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { tenantId, clinicId, destinationId } = stateData;

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantMsft}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: clientId!, client_secret: clientSecret!,
          redirect_uri: redirectUri!, grant_type: 'authorization_code',
        }),
      },
    );
    const tokens = await tokenRes.json() as any;
    if (tokens.error) throw new BadRequestException(`Microsoft OAuth error: ${tokens.error_description}`);

    const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userRes.json() as any;
    const accountEmail = userInfo.mail || userInfo.userPrincipalName;

    const existing = await this.prisma.oAuthToken.findFirst({
      where: { tenantId, provider: 'MICROSOFT', accountEmail },
    });

    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    const tokenData = {
      tenantId,
      clinicId: clinicId ?? null,
      destinationId: destinationId ?? null,
      provider: 'MICROSOFT' as const,
      accessToken: this.encKey ? EncryptionUtil.encrypt(tokens.access_token, this.encKey) : tokens.access_token,
      refreshToken: tokens.refresh_token
        ? (this.encKey ? EncryptionUtil.encrypt(tokens.refresh_token, this.encKey) : tokens.refresh_token)
        : null,
      expiresAt,
      scope: tokens.scope,
      accountEmail,
      accountId: userInfo.id,
    };

    let result;
    if (existing) {
      result = await this.prisma.oAuthToken.update({ where: { id: existing.id }, data: tokenData });
    } else {
      result = await this.prisma.oAuthToken.create({ data: tokenData });
    }

    await this.auditService.log({
      tenantId,
      clinicId: clinicId ?? undefined,
      action: 'STORAGE_CONFIGURED',
      entityType: 'OAuthToken',
      entityId: result.id,
      newValues: { provider: 'MICROSOFT', accountEmail, destinationId },
      success: true,
    });

    return result;
  }

  // ─── List ────────────────────────────────────────────────────

  async listTokens(currentUser: JwtPayload, clinicId?: string) {
    const where: Record<string, unknown> =
      currentUser.role === 'SUPER_ADMIN'
        ? {}
        : { tenantId: currentUser.tenantId };

    if (clinicId) where.clinicId = clinicId;
    else if (currentUser.clinicId) where.clinicId = currentUser.clinicId;

    return this.prisma.oAuthToken.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, provider: true, accountEmail: true, accountId: true,
        expiresAt: true, clinicId: true, destinationId: true,
        createdAt: true, updatedAt: true,
        destination: { select: { id: true, name: true, type: true } },
      },
    });
  }

  // ─── Revoke ──────────────────────────────────────────────────

  async revokeToken(id: string, currentUser: JwtPayload) {
    this.assertAdminRole(currentUser);

    const token = await this.prisma.oAuthToken.findFirst({
      where: currentUser.role === 'SUPER_ADMIN'
        ? { id }
        : { id, tenantId: currentUser.tenantId },
    });
    if (!token) throw new NotFoundException('Token not found');

    await this.prisma.oAuthToken.delete({ where: { id } });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      clinicId: token.clinicId ?? undefined,
      userId: currentUser.sub,
      action: 'STORAGE_CONFIGURED',
      entityType: 'OAuthToken',
      entityId: id,
      oldValues: { provider: token.provider, accountEmail: token.accountEmail },
      metadata: { action: 'revoked' },
      success: true,
    });
  }

  buildState(data: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }
}
