import { randomBytes, createHash } from 'crypto';

import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtPayload } from '@smartpacs/types';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

import { EncryptionUtil, SENSITIVE_CONFIG_FIELDS } from '../../common/utils/encryption.util';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IngestStudyDto } from '../study/dto/ingest-study.dto';
import { StudyService } from '../study/study.service';

import { AgentQueryDto } from './dto/agent-query.dto';
import { CreateEnrollmentTokenDto } from './dto/create-enrollment-token.dto';
import { EnrollAgentDto } from './dto/enroll-agent.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { RegisterAgentDto } from './dto/register-agent.dto';



interface AgentRecordInput {
  version: string;
  hostname?: string;
  platform?: string;
  osVersion?: string;
  dicomConfig: RegisterAgentDto['dicomConfig'];
}

@Injectable()
export class EdgeAgentService {
  private readonly logger = new Logger(EdgeAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly studyService: StudyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterAgentDto, currentUser: JwtPayload) {
    const result = await this.createAgentRecord(currentUser.tenantId, dto.clinicId, dto.name, dto);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'AGENT_REGISTERED',
      entityType: 'EdgeAgent',
      entityId: result.agentId,
      newValues: { name: dto.name, clinicId: dto.clinicId },
    });

    return result;
  }

  async createEnrollmentToken(dto: CreateEnrollmentTokenDto, currentUser: JwtPayload) {
    const token = randomBytes(24).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.agentEnrollmentToken.create({
      data: {
        tenantId: currentUser.tenantId,
        clinicId: dto.clinicId,
        name: dto.name,
        tokenHash,
        expiresAt,
        createdByUserId: currentUser.sub,
      },
    });

    // Returned once only — only the hash is ever persisted
    return { token, expiresAt };
  }

  async enroll(dto: EnrollAgentDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const enrollmentToken = await this.prisma.agentEnrollmentToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!enrollmentToken) throw new UnauthorizedException('Invalid or expired enrollment token');

    await this.prisma.agentEnrollmentToken.update({
      where: { id: enrollmentToken.id },
      data: { usedAt: new Date() },
    });

    const result = await this.createAgentRecord(
      enrollmentToken.tenantId,
      enrollmentToken.clinicId,
      enrollmentToken.name,
      dto,
    );

    await this.auditService.log({
      tenantId: enrollmentToken.tenantId,
      clinicId: enrollmentToken.clinicId,
      action: 'AGENT_ENROLLED',
      entityType: 'EdgeAgent',
      entityId: result.agentId,
      newValues: { name: enrollmentToken.name, clinicId: enrollmentToken.clinicId },
    });

    return result;
  }

  private async createAgentRecord(
    tenantId: string,
    clinicId: string,
    name: string,
    dto: AgentRecordInput,
  ) {
    const apiKey = `agt_${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;
    const apiKeyHash = await argon2.hash(apiKey, { type: argon2.argon2id });

    const agent = await this.prisma.edgeAgent.create({
      data: {
        tenantId,
        clinicId,
        name,
        version: dto.version,
        hostname: dto.hostname,
        platform: dto.platform,
        osVersion: dto.osVersion,
        apiKey,
        apiKeyHash,
        dicomAeTitle: dto.dicomConfig.aeTitle,
        dicomPort: dto.dicomConfig.port,
        dicomConfig: dto.dicomConfig as any,
        remoteConfig: {
          syncIntervalSeconds: 30,
          heartbeatIntervalSeconds: 15,
          maxConcurrentUploads: 3,
          chunkSizeMB: 8,
          retryAttempts: 5,
          retryDelaySeconds: 60,
        },
      },
    });

    // Return config the agent needs to operate (masked — decrypted secrets are only
    // ever served via the agent-API-key-gated getRuntimeConfig()/runtime-config route)
    const storageDestinations = await this.prisma.storageDestination.findMany({
      where: { clinicId, isActive: true, deletedAt: null },
      select: { id: true, name: true, type: true, isDefault: true },
    });

    return {
      agentId: agent.id,
      apiKey, // Return once only — not stored in plaintext
      config: {
        ...(agent.remoteConfig as Record<string, unknown> | null ?? {}),
        storageDestinations,
      },
    };
  }

  /** [AGENT] Decrypted destination credentials — only ever reached via a valid agent API key. */
  async getRuntimeConfig(id: string) {
    const agent = await this.prisma.edgeAgent.findFirst({ where: { id, deletedAt: null } });
    if (!agent) throw new NotFoundException('Agent not found');

    const [destinations, clinic] = await Promise.all([
      this.prisma.storageDestination.findMany({
        where: { clinicId: agent.clinicId, isActive: true, deletedAt: null },
        select: { id: true, name: true, type: true, isDefault: true, config: true },
      }),
      this.prisma.clinic.findUniqueOrThrow({
        where: { id: agent.clinicId },
        include: { tenant: { select: { features: true } } },
      }),
    ]);

    const key = this.configService.get<string>('app.encryptionKey')!;
    const storageDestinations = destinations.map((d) => ({
      ...d,
      config: EncryptionUtil.decryptFields(d.config as Record<string, unknown>, SENSITIVE_CONFIG_FIELDS, key),
    }));

    const tenantFeatures = clinic.tenant.features as Record<string, boolean>;
    const worklist = {
      enabled: !!(tenantFeatures.worklistEnabled && clinic.worklistEnabled && clinic.worklistHisUrl),
      hisUrl: clinic.worklistHisUrl ?? undefined,
      aeTitle: clinic.worklistAeTitle ?? undefined,
    };

    return {
      remoteConfig: agent.remoteConfig,
      storageDestinations,
      worklist,
    };
  }

  /** [AGENT] Records that a study has been pushed into the central Orthanc archive. */
  async markStudyStoredInOrthanc(agentId: string, studyInstanceUid: string, orthancStudyId: string) {
    const agent = await this.prisma.edgeAgent.findFirst({ where: { id: agentId, deletedAt: null } });
    if (!agent) throw new NotFoundException('Agent not found');

    await this.prisma.study.updateMany({
      where: { tenantId: agent.tenantId, studyInstanceUid },
      data: { orthancStudyId, orthancStoredAt: new Date() },
    });
  }

  async validateApiKey(agentId: string, apiKey: string) {
    const agent = await this.prisma.edgeAgent.findFirst({
      where: { id: agentId, deletedAt: null },
    });

    if (!agent) throw new UnauthorizedException('Agent not found');

    const isValid = await argon2.verify(agent.apiKeyHash, apiKey);
    if (!isValid) throw new UnauthorizedException('Invalid API key');

    return agent;
  }

  async heartbeat(agentId: string, dto: HeartbeatDto) {
    const previousStatus = await this.prisma.edgeAgent.findFirst({
      where: { id: agentId },
      select: { status: true },
    });

    await this.prisma.edgeAgent.update({
      where: { id: agentId },
      data: {
        status: dto.status as any,
        lastHeartbeatAt: new Date(),
        ipAddress: dto.ipAddress,
        lastMetrics: dto.metrics as any,
        lastQueueStats: dto.queueStats as any,
      },
    });

    // Store heartbeat for time-series monitoring
    await this.prisma.edgeAgentHeartbeat.create({
      data: {
        agentId,
        status: dto.status as any,
        metrics: dto.metrics as any,
        queueStats: dto.queueStats as any,
        ipAddress: dto.ipAddress,
      },
    }).catch(() => null); // Non-critical

    // Emit status change event for real-time notifications
    if (previousStatus?.status !== dto.status) {
      this.eventEmitter.emit('agent.status_changed', {
        agentId,
        previousStatus: previousStatus?.status,
        newStatus: dto.status,
      });
    }
  }

  async reportStudy(agentId: string, dto: IngestStudyDto) {
    const agent = await this.prisma.edgeAgent.findFirst({
      where: { id: agentId },
      select: { tenantId: true, clinicId: true },
    });

    if (!agent) throw new NotFoundException('Agent not found');

    const study = await this.studyService.ingest(
      dto,
      agentId,
      agent.tenantId,
      agent.clinicId,
    );

    await this.prisma.edgeAgent.update({
      where: { id: agentId },
      data: { lastSyncAt: new Date() },
    });

    return study;
  }

  async findById(id: string, currentUser: JwtPayload) {
    const where: Record<string, unknown> = { id };
    if (currentUser.role !== 'SUPER_ADMIN') where.tenantId = currentUser.tenantId;

    const agent = await this.prisma.edgeAgent.findFirst({
      where,
      include: {
        clinic: { select: { id: true, name: true } },
      },
    });

    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async getAgentConfig(id: string, currentUser: JwtPayload) {
    const agent = await this.findById(id, currentUser);

    const storageDestinations = await this.prisma.storageDestination.findMany({
      where: { clinicId: agent.clinicId, isActive: true, deletedAt: null },
      select: { id: true, name: true, type: true, isDefault: true },
    });

    return {
      remoteConfig: agent.remoteConfig,
      storageDestinations,
    };
  }

  async findAll(query: AgentQueryDto, currentUser: JwtPayload) {
    const { skip, take, page, limit } = parsePagination(query);

    // SUPER_ADMIN sees all agents; others are scoped to their tenant
    const where: Record<string, unknown> =
      currentUser.role === 'SUPER_ADMIN'
        ? {}
        : { tenantId: currentUser.tenantId };

    // Clinic-scoped users only see their clinic's agents
    if (!query.clinicId && currentUser.clinicId) {
      where.clinicId = currentUser.clinicId;
    }
    if (query.clinicId) where.clinicId = query.clinicId;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.edgeAgent.findMany({
        where,
        skip,
        take,
        orderBy: { lastHeartbeatAt: 'desc' },
        select: {
          id: true, name: true, version: true, status: true,
          hostname: true, platform: true, ipAddress: true,
          lastHeartbeatAt: true, lastSyncAt: true,
          lastMetrics: true, lastQueueStats: true,
          dicomAeTitle: true, dicomPort: true,
          clinicId: true,
          clinic: { select: { id: true, name: true } },
          createdAt: true,
        },
      }),
      this.prisma.edgeAgent.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async revokeAgent(id: string, currentUser: JwtPayload) {
    const agent = await this.prisma.edgeAgent.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    await this.prisma.edgeAgent.delete({ where: { id } });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'AGENT_REVOKED',
      entityType: 'EdgeAgent',
      entityId: id,
    });
  }
}
