import { createHash } from 'crypto';

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudyStatus } from '@prisma/client';
import { JwtPayload } from '@smartpacs/types';

import { studiesIngestedTotal } from '../../common/metrics/app-metrics';
import { parsePagination, buildPaginatedResponse, buildOrderBy } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

import { IngestStudyDto } from './dto/ingest-study.dto';
import { StudyQueryDto } from './dto/study-query.dto';



@Injectable()
export class StudyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(query: StudyQueryDto, currentUser: JwtPayload) {
    const { skip, take, page, limit } = parsePagination(query);
    const orderBy = buildOrderBy(query.sortBy, query.sortOrder, [
      'studyDate', 'createdAt', 'patientName', 'accessionNumber',
    ]);

    // SUPER_ADMIN sees all studies; others are scoped to their tenant
    const where: Record<string, unknown> =
      currentUser.role === 'SUPER_ADMIN'
        ? {}
        : { tenantId: currentUser.tenantId };

    // Clinic-scoped roles only see their clinic's studies
    if (currentUser.clinicId && !query.clinicId) {
      where.clinicId = currentUser.clinicId;
    }
    if (query.clinicId) where.clinicId = query.clinicId;
    if (query.status) where.status = Array.isArray(query.status) ? { in: query.status } : query.status;
    if (query.modality) {
      where.modalities = Array.isArray(query.modality)
        ? { hasSome: query.modality }
        : { has: query.modality };
    }
    if (query.patientId) where.patientId = { contains: query.patientId, mode: 'insensitive' };
    if (query.accessionNumber) where.accessionNumber = { contains: query.accessionNumber, mode: 'insensitive' };
    if (query.from || query.to) {
      where.studyDate = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }
    if (query.q) {
      where.OR = [
        { patientName: { contains: query.q, mode: 'insensitive' } },
        { patientId: { contains: query.q, mode: 'insensitive' } },
        { accessionNumber: { contains: query.q, mode: 'insensitive' } },
        { studyDescription: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.study.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          clinic: { select: { id: true, name: true } },
          edgeAgent: { select: { id: true, name: true } },
          exportJobs: {
            select: {
              id: true, status: true, destinationType: true,
              completedAt: true, progressPercent: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      }),
      this.prisma.study.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findById(id: string, currentUser: JwtPayload) {
    const study = await this.prisma.study.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      include: {
        clinic: { select: { id: true, name: true } },
        edgeAgent: { select: { id: true, name: true, status: true } },
        dicomFiles: {
          orderBy: [{ seriesNumber: 'asc' }, { instanceNumber: 'asc' }],
          select: {
            id: true, seriesInstanceUid: true, sopInstanceUid: true,
            fileName: true, fileSize: true, isVideo: true,
            frameCount: true, thumbnailPath: true, instanceNumber: true,
            seriesNumber: true,
          },
        },
        exportJobs: {
          orderBy: { createdAt: 'desc' },
          include: {
            destination: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    if (!study) throw new NotFoundException('Study not found');
    this.assertStudyAccess(study, currentUser);

    return study;
  }

  async ingest(dto: IngestStudyDto, agentId: string, tenantId: string, clinicId: string) {
    const studyHash = createHash('sha256')
      .update(`${dto.studyInstanceUid}:${dto.patientId || ''}`)
      .digest('hex');

    const study = await this.prisma.study.upsert({
      where: {
        tenantId_studyInstanceUid: {
          tenantId,
          studyInstanceUid: dto.studyInstanceUid,
        },
      },
      update: {
        status: 'RECEIVING',
        fileCount: { increment: dto.fileCount || 1 },
        totalSizeBytes: { increment: BigInt(dto.totalSizeBytes || 0) },
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        clinicId,
        edgeAgentId: agentId,
        patientId: dto.patientId,
        patientName: dto.patientName,
        patientBirthDate: dto.patientBirthDate ? new Date(dto.patientBirthDate) : undefined,
        patientSex: dto.patientSex,
        studyInstanceUid: dto.studyInstanceUid,
        accessionNumber: dto.accessionNumber,
        studyDate: dto.studyDate ? new Date(dto.studyDate) : undefined,
        studyDescription: dto.studyDescription,
        modalities: dto.modalities as any || [],
        status: 'RECEIVING',
        storagePath: dto.storagePath ?? '',
        fileCount: dto.fileCount || 0,
        totalSizeBytes: BigInt(dto.totalSizeBytes || 0),
        hash: studyHash,
        institutionName: dto.institutionName,
        stationName: dto.stationName,
        manufacturer: dto.manufacturer,
        modelName: dto.modelName,
      },
    });

    studiesIngestedTotal.inc({ modality: dto.modalities?.[0] || 'UNKNOWN' });

    this.eventEmitter.emit('study.received', {
      studyId: study.id,
      tenantId,
      clinicId,
      agentId,
    });

    return study;
  }

  async updateStatus(id: string, status: StudyStatus, currentUser: JwtPayload) {
    const study = await this.prisma.study.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });
    if (!study) throw new NotFoundException('Study not found');

    return this.prisma.study.update({
      where: { id },
      data: { status },
    });
  }

  async getStats(currentUser: JwtPayload) {
    // SUPER_ADMIN sees aggregate across all tenants; others are scoped to their tenant
    const tenantFilter = currentUser.role === 'SUPER_ADMIN' ? {} : { tenantId: currentUser.tenantId };
    const clinicFilter = currentUser.clinicId ? { clinicId: currentUser.clinicId } : {};

    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const baseWhere = { ...tenantFilter, ...clinicFilter };

    const [
      total, today, thisWeek, thisMonth,
      byStatus, sizeAgg,
    ] = await Promise.all([
      this.prisma.study.count({ where: baseWhere }),
      this.prisma.study.count({ where: { ...baseWhere, createdAt: { gte: startOfDay } } }),
      this.prisma.study.count({ where: { ...baseWhere, createdAt: { gte: startOfWeek } } }),
      this.prisma.study.count({ where: { ...baseWhere, createdAt: { gte: startOfMonth } } }),
      this.prisma.study.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: true,
      }),
      this.prisma.study.aggregate({
        where: baseWhere,
        _sum: { totalSizeBytes: true },
        _avg: { totalSizeBytes: true },
      }),
    ]);

    return {
      total,
      today,
      thisWeek,
      thisMonth,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      totalSizeBytes: Number(sizeAgg._sum.totalSizeBytes || 0),
      averageSizeBytes: Number(sizeAgg._avg.totalSizeBytes || 0),
    };
  }

  private assertStudyAccess(study: { clinicId: string }, currentUser: JwtPayload) {
    if (
      currentUser.role !== 'SUPER_ADMIN' &&
      currentUser.role !== 'TENANT_ADMIN' &&
      currentUser.clinicId &&
      study.clinicId !== currentUser.clinicId
    ) {
      throw new ForbiddenException('Access denied to this study');
    }
  }
}
