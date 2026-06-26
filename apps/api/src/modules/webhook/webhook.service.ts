import { randomBytes, createHmac } from 'crypto';

import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtPayload } from '@smartpacs/types';
import { Queue } from 'bull';


import { EncryptionUtil } from '../../common/utils/encryption.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';


import { CreateWebhookConfigDto } from './dto/create-webhook-config.dto';
import { UpdateWebhookConfigDto } from './dto/update-webhook-config.dto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectQueue('webhooks') private readonly webhookQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────

  async findAll(currentUser: JwtPayload) {
    const where = currentUser.role === 'SUPER_ADMIN' ? {} : { tenantId: currentUser.tenantId };
    const configs = await this.prisma.webhookConfig.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return configs.map(({ secret, ...rest }) => rest);
  }

  async create(dto: CreateWebhookConfigDto, currentUser: JwtPayload) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: currentUser.tenantId } });
    const features = tenant.features as Record<string, boolean>;
    if (currentUser.role !== 'SUPER_ADMIN' && !features.webhooks) {
      throw new ForbiddenException('Webhooks não estão disponíveis no plano deste tenant');
    }

    const plainSecret = randomBytes(32).toString('hex');
    const key = this.configService.get<string>('app.encryptionKey')!;

    const config = await this.prisma.webhookConfig.create({
      data: {
        tenantId: currentUser.tenantId,
        clinicId: dto.clinicId,
        name: dto.name,
        url: dto.url,
        events: dto.events,
        retryAttempts: dto.retryAttempts ?? 3,
        timeoutSeconds: dto.timeoutSeconds ?? 30,
        secret: EncryptionUtil.encrypt(plainSecret, key),
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'CREATE',
      entityType: 'WebhookConfig',
      entityId: config.id,
    });

    // The plaintext secret is only ever shown once — the receiving endpoint needs it
    // to verify the X-Webhook-Signature HMAC on every delivery from here on.
    const { secret, ...rest } = config;
    return { ...rest, secret: plainSecret };
  }

  async update(id: string, dto: UpdateWebhookConfigDto, currentUser: JwtPayload) {
    await this.assertOwnership(id, currentUser);

    const config = await this.prisma.webhookConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.events !== undefined && { events: dto.events }),
        ...(dto.retryAttempts !== undefined && { retryAttempts: dto.retryAttempts }),
        ...(dto.timeoutSeconds !== undefined && { timeoutSeconds: dto.timeoutSeconds }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'UPDATE',
      entityType: 'WebhookConfig',
      entityId: id,
    });

    const { secret, ...rest } = config;
    return rest;
  }

  async remove(id: string, currentUser: JwtPayload) {
    await this.assertOwnership(id, currentUser);

    await this.prisma.webhookConfig.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'DELETE',
      entityType: 'WebhookConfig',
      entityId: id,
    });

    return { success: true };
  }

  async rotateSecret(id: string, currentUser: JwtPayload) {
    await this.assertOwnership(id, currentUser);

    const plainSecret = randomBytes(32).toString('hex');
    const key = this.configService.get<string>('app.encryptionKey')!;

    await this.prisma.webhookConfig.update({
      where: { id },
      data: { secret: EncryptionUtil.encrypt(plainSecret, key) },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      userId: currentUser.sub,
      action: 'UPDATE',
      entityType: 'WebhookConfig',
      entityId: id,
      metadata: { rotatedSecret: true },
    });

    return { secret: plainSecret };
  }

  private async assertOwnership(id: string, currentUser: JwtPayload): Promise<void> {
    const config = await this.prisma.webhookConfig.findFirst({ where: { id, deletedAt: null } });
    if (!config) throw new NotFoundException('Webhook não encontrado');
    if (currentUser.role !== 'SUPER_ADMIN' && config.tenantId !== currentUser.tenantId) {
      throw new NotFoundException('Webhook não encontrado');
    }
  }

  // ─── Event listeners → dispatch to queue ────────────────────────

  @OnEvent('study.received')
  async onStudyReceived(payload: { studyId: string; tenantId: string; clinicId: string }) {
    await this.dispatch('study.received', payload.tenantId, payload.clinicId, payload);
  }

  @OnEvent('export.completed')
  async onExportCompleted(payload: unknown) {
    const p = payload as Record<string, string>;
    await this.dispatch('export.completed', p.tenantId, p.clinicId, payload);
  }

  @OnEvent('agent.status_changed')
  async onAgentStatusChanged(payload: unknown) {
    const p = payload as Record<string, string>;
    if (p.newStatus === 'OFFLINE') {
      await this.dispatch('agent.offline', p.tenantId, '', payload);
    } else if (p.previousStatus === 'OFFLINE' && p.newStatus === 'ONLINE') {
      await this.dispatch('agent.online', p.tenantId, '', payload);
    }
  }

  private async dispatch(
    event: string,
    tenantId: string,
    clinicId: string,
    data: unknown,
  ) {
    const configs = await this.prisma.webhookConfig.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        events: { has: event },
      },
    });

    const key = this.configService.get<string>('app.encryptionKey')!;

    for (const config of configs) {
      const secret = EncryptionUtil.decrypt(config.secret, key);
      await this.webhookQueue.add(
        'deliver',
        {
          configId: config.id,
          url: config.url,
          secret,
          event,
          data,
          timeoutSeconds: config.timeoutSeconds,
        },
        {
          attempts: config.retryAttempts,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    }
  }

  signPayload(secret: string, payload: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  async recordDeliveryResult(configId: string, statusCode: number, success: boolean) {
    await this.prisma.webhookConfig.update({
      where: { id: configId },
      data: {
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: statusCode,
        deliveryCount: { increment: 1 },
        ...(!success && { failureCount: { increment: 1 } }),
      },
    }).catch(() => undefined); // Config may have been deleted between dispatch and delivery — non-fatal.
  }
}
