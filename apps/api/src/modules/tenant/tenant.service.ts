import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { JwtPayload } from '@smartpacs/types';
import * as argon2 from 'argon2';

import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(params: { page: number; limit: number }) {
    const { skip, take, page, limit } = parsePagination(params);
    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        skip, take, orderBy: { createdAt: 'desc' },
        include: { _count: { select: { clinics: true, users: true } } },
      }),
      this.prisma.tenant.count(),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async findById(id: string, currentUser: JwtPayload) {
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.tenantId !== id) {
      throw new ForbiddenException('Access denied');
    }
    const tenant = await this.prisma.tenant.findFirst({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async create(dto: Record<string, unknown>, _currentUser: JwtPayload) {
    const passwordHash = await argon2.hash(dto.adminPassword as string, { type: argon2.argon2id });

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name as string,
          slug: (dto.slug as string).toLowerCase().replace(/\s+/g, '-'),
          plan: (dto.plan as any) || 'STARTER',
          billingEmail: dto.billingEmail as string,
          settings: { timezone: 'America/Sao_Paulo', locale: 'pt-BR', dateFormat: 'DD/MM/YYYY', autoExportEnabled: true },
          quotas: { maxClinics: 3, maxUsers: 10, maxStorageGB: 100, maxEdgeAgents: 5, usedStorageGB: 0, studiesThisMonth: 0 },
          features: { mfa: false, auditLogs: true, webhooks: false, dicomAnonymization: false, bulkExport: false, worklistEnabled: false },
        },
      });

      await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: (dto.adminEmail as string).toLowerCase(),
          name: dto.adminName as string,
          passwordHash,
          role: 'TENANT_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date(),
          permissions: ['clinics:read','clinics:write','users:read','users:write','studies:read','studies:write','storage:read','storage:configure','audit:read'],
        },
      });

      return tenant;
    });
  }

  async update(id: string, dto: Record<string, unknown>, currentUser: JwtPayload) {
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.tenantId !== id) {
      throw new ForbiddenException('Access denied');
    }
    return this.prisma.tenant.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    await this.prisma.tenant.delete({ where: { id } });
  }
}
