import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@smartpacs/types';

import { EncryptionUtil, SENSITIVE_CONFIG_FIELDS } from '../../common/utils/encryption.util';
import { parsePagination, buildPaginatedResponse, buildOrderBy } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

import { ClinicQueryDto } from './dto/clinic-query.dto';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { UpsertStorageDestinationDto } from './dto/upsert-storage-destination.dto';


@Injectable()
export class ClinicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(query: ClinicQueryDto, currentUser: JwtPayload) {
    const { skip, take, page, limit } = parsePagination(query);
    const orderBy = buildOrderBy(query.sortBy, query.sortOrder, ['name', 'createdAt']);

    // SUPER_ADMIN sees all clinics (optionally filtered by tenantId query param)
    const where: Record<string, unknown> =
      currentUser.role === 'SUPER_ADMIN'
        ? query.tenantId ? { tenantId: query.tenantId } : {}
        : { tenantId: currentUser.tenantId };

    // Clinic-scoped users only see their own clinic
    if (currentUser.clinicId && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'TENANT_ADMIN') {
      where.id = currentUser.clinicId;
    }
    if (query.status) where.status = query.status;
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.clinic.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          _count: { select: { edgeAgents: true, users: true, studies: true } },
          storageDestinations: {
            where: { deletedAt: null },
            select: {
              id: true, name: true, type: true, isDefault: true,
              isActive: true, lastSyncAt: true, lastSyncStatus: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.clinic.count({ where }),
    ]);

    const enriched = data.map((clinic) => ({
      ...clinic,
      edgeAgentCount: clinic._count.edgeAgents,
      userCount: clinic._count.users,
      studyCount: clinic._count.studies,
      _count: undefined,
    }));

    return buildPaginatedResponse(enriched, total, page, limit);
  }

  async findById(id: string, currentUser: JwtPayload) {
    this.assertAccess(id, currentUser);

    const clinic = await this.prisma.clinic.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      include: {
        storageDestinations: {
          where: { deletedAt: null },
          select: {
            id: true, name: true, type: true, isDefault: true,
            isActive: true, lastSyncAt: true, lastSyncStatus: true,
          },
        },
        edgeAgents: {
          where: { deletedAt: null },
          select: {
            id: true, name: true, status: true, version: true,
            lastHeartbeatAt: true, lastSyncAt: true,
          },
        },
        _count: { select: { studies: true, users: true } },
      },
    });

    if (!clinic) throw new NotFoundException('Clinic not found');
    return clinic;
  }

  async create(dto: CreateClinicDto, currentUser: JwtPayload) {
    // Super Admin can create a clinic in any tenant by passing _tenantId
    const targetTenantId = (currentUser.role === 'SUPER_ADMIN' && dto._tenantId)
      ? dto._tenantId
      : currentUser.tenantId;

    const clinic = await this.prisma.clinic.create({
      data: {
        tenantId: targetTenantId,
        name: dto.name,
        logoUrl: dto.logoUrl,
        cnpj: dto.cnpj,
        cnes: dto.cnes,
        addressCity: dto.addressCity,
        addressState: dto.addressState,
        addressStreet: dto.addressStreet,
        addressNumber: dto.addressNumber,
        addressComplement: dto.addressComplement,
        addressNeighborhood: dto.addressNeighborhood,
        addressZipCode: dto.addressZipCode,
        addressCountry: dto.addressCountry || 'BR',
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        contactWebsite: dto.contactWebsite,
        contactResponsible: dto.contactResponsible,
        dicomAeTitle: dto.dicomAeTitle || 'SMARTPACS',
        dicomPort: dto.dicomPort || 104,
        timezone: dto.timezone || 'America/Sao_Paulo',
        autoExportEnabled: dto.autoExportEnabled ?? true,
        exportOnComplete: dto.exportOnComplete ?? true,
        worklistEnabled: dto.worklistEnabled ?? false,
        worklistHisUrl: dto.worklistHisUrl,
        worklistAeTitle: dto.worklistAeTitle,
        anonymizeOnExport: dto.anonymizeOnExport ?? false,
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'CREATE',
      entityType: 'Clinic',
      entityId: clinic.id,
      newValues: { name: clinic.name },
    });

    return clinic;
  }

  async update(id: string, dto: UpdateClinicDto, currentUser: JwtPayload) {
    await this.assertClinicBelongsToTenant(id, currentUser.tenantId, currentUser.role);

    const { status, ...rest } = dto;
    const clinic = await this.prisma.clinic.update({
      where: { id },
      data: {
        ...rest,
        ...(status && { status: status as any }),
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'UPDATE',
      entityType: 'Clinic',
      entityId: id,
    });

    return clinic;
  }

  async remove(id: string, currentUser: JwtPayload) {
    await this.assertClinicBelongsToTenant(id, currentUser.tenantId, currentUser.role);

    const studyCount = await this.prisma.study.count({ where: { clinicId: id } });
    if (studyCount > 0) {
      throw new ConflictException(`Cannot delete clinic with ${studyCount} studies`);
    }

    await this.prisma.clinic.delete({ where: { id } });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'DELETE',
      entityType: 'Clinic',
      entityId: id,
    });
  }

  // ─── Storage Destinations ─────────────────────────────────

  async getStorageDestinations(clinicId: string, currentUser: JwtPayload) {
    await this.assertClinicBelongsToTenant(clinicId, currentUser.tenantId, currentUser.role);

    const destinations = await this.prisma.storageDestination.findMany({
      where: { clinicId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return destinations.map((d) => ({
      ...d,
      config: this.maskSensitiveConfig(d.config as Record<string, unknown>, d.type),
    }));
  }

  async upsertStorageDestination(
    clinicId: string,
    dto: UpsertStorageDestinationDto,
    currentUser: JwtPayload,
  ) {
    await this.assertClinicBelongsToTenant(clinicId, currentUser.tenantId, currentUser.role);

    const encryptedConfig = this.encryptConfig(dto.config as Record<string, unknown>);

    if (dto.isDefault) {
      await this.prisma.storageDestination.updateMany({
        where: { clinicId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const destination = dto.id
      ? await this.prisma.storageDestination.update({
          where: { id: dto.id },
          data: {
            name: dto.name,
            type: dto.type as any,
            isDefault: dto.isDefault ?? false,
            isActive: dto.isActive ?? true,
            config: encryptedConfig as any,
          },
        })
      : await this.prisma.storageDestination.create({
          data: {
            tenantId: currentUser.tenantId,
            clinicId,
            name: dto.name,
            type: dto.type as any,
            isDefault: dto.isDefault ?? false,
            isActive: dto.isActive ?? true,
            config: encryptedConfig as any,
          },
        });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'STORAGE_CONFIGURED',
      entityType: 'StorageDestination',
      entityId: destination.id,
      newValues: { name: destination.name, type: destination.type },
    });

    return destination;
  }

  async deleteStorageDestination(clinicId: string, destinationId: string, currentUser: JwtPayload) {
    await this.assertClinicBelongsToTenant(clinicId, currentUser.tenantId, currentUser.role);

    await this.prisma.storageDestination.delete({
      where: { id: destinationId, clinicId },
    });
  }

  private encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
    const key = this.configService.get<string>('app.encryptionKey')!;
    return EncryptionUtil.encryptFields(config, SENSITIVE_CONFIG_FIELDS, key);
  }

  private maskSensitiveConfig(
    config: Record<string, unknown>,
    _type: string,
  ): Record<string, unknown> {
    const result = { ...config };
    for (const field of SENSITIVE_CONFIG_FIELDS) {
      if (result[field]) result[field] = '****';
    }
    return result;
  }

  private async assertClinicBelongsToTenant(
    clinicId: string,
    tenantId: string,
    role?: string,
  ) {
    if (role === 'SUPER_ADMIN') return; // Super admin can access any clinic
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId },
      select: { id: true },
    });
    if (!clinic) throw new NotFoundException('Clinic not found');
  }

  private assertAccess(clinicId: string, currentUser: JwtPayload) {
    if (
      currentUser.role !== 'SUPER_ADMIN' &&
      currentUser.role !== 'TENANT_ADMIN' &&
      currentUser.clinicId !== clinicId
    ) {
      throw new ForbiddenException('Access denied to this clinic');
    }
  }
}
