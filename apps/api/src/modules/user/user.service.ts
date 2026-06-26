import { randomInt } from 'crypto';

import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { JwtPayload } from '@smartpacs/types';
import * as argon2 from 'argon2';

import { parsePagination, buildPaginatedResponse, buildOrderBy } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';

const PASSWORD_CHARS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnpqrstuvwxyz',
  digit: '23456789',
  special: '@$!%*?&',
};

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Random password satisfying the same complexity rule enforced on /reset-password. */
  private generateTemporaryPassword(): string {
    const pick = (chars: string) => chars[randomInt(chars.length)];
    const required = [
      pick(PASSWORD_CHARS.upper),
      pick(PASSWORD_CHARS.lower),
      pick(PASSWORD_CHARS.digit),
      pick(PASSWORD_CHARS.special),
    ];
    const all = Object.values(PASSWORD_CHARS).join('');
    const rest = Array.from({ length: 8 }, () => pick(all));
    return [...required, ...rest].sort(() => randomInt(3) - 1).join('');
  }

  async findAll(query: UserQueryDto, currentUser: JwtPayload) {
    const { skip, take, page, limit } = parsePagination(query);
    const orderBy = buildOrderBy(query.sortBy, query.sortOrder, ['name', 'email', 'createdAt', 'lastLoginAt']);

    // SUPER_ADMIN sees all users (optionally filtered by tenantId query param)
    const where: Record<string, unknown> =
      currentUser.role === 'SUPER_ADMIN'
        ? query.tenantId ? { tenantId: query.tenantId } : {}
        : { tenantId: currentUser.tenantId };

    // Clinic-scoped users only see users from their clinic
    if (currentUser.clinicId && !query.clinicId && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'TENANT_ADMIN') {
      where.clinicId = currentUser.clinicId;
    }
    if (query.clinicId) where.clinicId = query.clinicId;
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        select: this.safeUserSelect(),
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findById(id: string, currentUser: JwtPayload) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      select: this.safeUserSelect(),
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, currentUser: JwtPayload) {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: currentUser.tenantId, email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already registered in this tenant');

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        tenantId: currentUser.tenantId,
        clinicId: dto.clinicId,
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
        role: dto.role as any,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
        permissions: dto.permissions?.length ? dto.permissions : this.defaultPermissions(dto.role),
      },
      select: this.safeUserSelect(),
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      newValues: { email: user.email, role: user.role },
    });

    return { ...user, temporaryPassword };
  }

  async update(id: string, dto: UpdateUserDto, currentUser: JwtPayload) {
    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });
    if (!existing) throw new NotFoundException('User not found');

    // Prevent self-demotion from super admin
    if (id === currentUser.sub && dto.role && dto.role !== existing.role) {
      throw new ForbiddenException('Cannot change your own role');
    }

    let email: string | undefined;
    if (dto.email && dto.email.toLowerCase() !== existing.email.toLowerCase()) {
      email = dto.email.toLowerCase();
      const taken = await this.prisma.user.findFirst({
        where: { tenantId: currentUser.tenantId, email, id: { not: id } },
      });
      if (taken) throw new ConflictException('Email already registered in this tenant');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email,
        name: dto.name,
        role: dto.role as any,
        clinicId: dto.clinicId,
        permissions: dto.permissions,
        status: dto.status as any,
      },
      select: this.safeUserSelect(),
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      oldValues: { role: existing.role, status: existing.status, ...(email ? { email: existing.email } : {}) },
      newValues: { role: updated.role, status: updated.status, ...(email ? { email: updated.email } : {}) },
    });

    return updated;
  }

  /** Admin sets a new password directly, shown once — no email round-trip required. */
  async resetPasswordDirect(id: string, currentUser: JwtPayload) {
    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });
    if (!existing) throw new NotFoundException('User not found');

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });

    await this.prisma.userSession.updateMany({
      where: { userId: id },
      data: { isRevoked: true },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: id,
      metadata: { source: 'admin_direct' },
    });

    return { temporaryPassword };
  }

  async remove(id: string, currentUser: JwtPayload) {
    if (id === currentUser.sub) throw new ForbiddenException('Cannot delete your own account');

    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });
    if (!existing) throw new NotFoundException('User not found');

    await this.prisma.user.delete({ where: { id } });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'DELETE',
      entityType: 'User',
      entityId: id,
    });
  }

  private defaultPermissions(role: string): string[] {
    const map: Record<string, string[]> = {
      SUPER_ADMIN: [
        'tenants:read', 'tenants:write', 'tenants:delete',
        'clinics:read', 'clinics:write', 'clinics:delete',
        'users:read', 'users:write', 'users:delete',
        'studies:read', 'studies:write', 'studies:delete', 'studies:export',
        'exports:read', 'exports:manage',
        'storage:read', 'storage:configure',
        'audit:read', 'system:admin',
      ],
      TENANT_ADMIN: [
        'clinics:read', 'clinics:write', 'clinics:delete',
        'users:read', 'users:write', 'users:delete',
        'studies:read', 'studies:write', 'studies:delete', 'studies:export',
        'exports:read', 'exports:manage',
        'storage:read', 'storage:configure',
        'audit:read',
      ],
      CLINIC_ADMIN: [
        'clinics:read', 'clinics:write',
        'users:read', 'users:write',
        'studies:read', 'studies:write', 'studies:export',
        'exports:read', 'exports:manage',
        'storage:read', 'storage:configure',
        'audit:read',
      ],
      OPERATOR: [
        'studies:read', 'studies:write', 'studies:export',
        'exports:read', 'exports:manage',
        'storage:read',
      ],
      PHYSICIAN: [
        'studies:read', 'studies:export',
        'exports:read',
      ],
      READONLY: [
        'studies:read',
        'exports:read',
        'audit:read',
      ],
    };
    return map[role] ?? [];
  }

  private safeUserSelect() {
    return {
      id: true,
      tenantId: true,
      clinicId: true,
      email: true,
      name: true,
      role: true,
      status: true,
      permissions: true,
      mfaEnabled: true,
      avatarUrl: true,
      lastLoginAt: true,
      loginCount: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      passwordHash: false,
      mfaSecret: false,
      mfaBackupCodes: false,
      passwordResetToken: false,
    };
  }
}
