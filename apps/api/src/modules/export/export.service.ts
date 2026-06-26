import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtPayload, ExportProgressEvent, StorageDestinationType } from '@smartpacs/types';
import { Queue } from 'bull';

import { exportJobsTotal } from '../../common/metrics/app-metrics';
import { EncryptionUtil, SENSITIVE_CONFIG_FIELDS } from '../../common/utils/encryption.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExportGateway } from '../realtime/export.gateway';



@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectQueue('exports') private readonly exportQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly exportGateway: ExportGateway,
  ) {}

  async createExportJob(
    studyId: string,
    destinationId: string,
    currentUser: JwtPayload,
  ) {
    const destination = await this.prisma.storageDestination.findFirst({
      where: { id: destinationId, tenantId: currentUser.tenantId, deletedAt: null },
    });
    if (!destination) throw new NotFoundException('Storage destination not found');

    return this.dispatchExportJob(studyId, destination, currentUser);
  }

  /**
   * One ExportJob per study, same destination, gated by the tenant's bulkExport plan
   * feature. Tolerant of partial failure — a study that 404s or belongs to another
   * clinic doesn't abort the rest of the batch, it's just reported back as an error
   * entry alongside the successes.
   */
  async createBulkExportJobs(
    studyIds: string[],
    destinationId: string,
    currentUser: JwtPayload,
  ) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: currentUser.tenantId } });
    const features = tenant.features as Record<string, boolean>;
    if (currentUser.role !== 'SUPER_ADMIN' && !features.bulkExport) {
      throw new ForbiddenException('Exportação em lote não está disponível no plano deste tenant');
    }

    const destination = await this.prisma.storageDestination.findFirst({
      where: { id: destinationId, tenantId: currentUser.tenantId, deletedAt: null },
    });
    if (!destination) throw new NotFoundException('Storage destination not found');

    const results: Array<{ studyId: string; jobId?: string; error?: string }> = [];

    for (const studyId of studyIds) {
      try {
        const job = await this.dispatchExportJob(studyId, destination, currentUser);
        results.push({ studyId, jobId: job.id });
      } catch (err) {
        results.push({ studyId, error: (err as Error).message });
      }
    }

    return results;
  }

  private async dispatchExportJob(
    studyId: string,
    destination: { id: string; type: StorageDestinationType },
    currentUser: JwtPayload,
  ) {
    const study = await this.prisma.study.findFirst({
      where: { id: studyId, tenantId: currentUser.tenantId, deletedAt: null },
    });
    if (!study) throw new NotFoundException('Study not found');

    if (
      currentUser.role !== 'SUPER_ADMIN' &&
      currentUser.role !== 'TENANT_ADMIN' &&
      currentUser.clinicId &&
      study.clinicId !== currentUser.clinicId
    ) {
      throw new ForbiddenException('Access denied to this study');
    }

    const job = await this.prisma.exportJob.create({
      data: {
        tenantId: currentUser.tenantId,
        clinicId: study.clinicId,
        studyId,
        destinationId: destination.id,
        destinationType: destination.type,
        status: 'PENDING',
      },
    });

    await this.exportQueue.add('process-export', { jobId: job.id }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30000 },
    });

    this.logger.log(`Export job created: ${job.id}`);
    return job;
  }

  async listExportJobs(studyId: string, currentUser: JwtPayload) {
    return this.prisma.exportJob.findMany({
      where: { studyId, tenantId: currentUser.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getExportJob(id: string, currentUser: JwtPayload) {
    const job = await this.prisma.exportJob.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      include: { logs: { orderBy: { timestamp: 'asc' }, take: 100 } },
    });
    if (!job) throw new NotFoundException('Export job not found');
    return job;
  }

  async retryExportJob(id: string, currentUser: JwtPayload) {
    await this.getExportJob(id, currentUser); // throws if not found / not owned by this tenant

    await this.prisma.exportJob.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, lastError: null, nextRetryAt: null },
    });

    await this.exportQueue.add('process-export', { jobId: id }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30000 },
    });

    return { success: true, jobId: id };
  }

  /** Decrypts the sensitive fields of a StorageDestination.config that were encrypted by ClinicService.encryptConfig. */
  decryptDestinationConfig(config: Record<string, unknown>): Record<string, unknown> {
    const key = this.configService.get<string>('app.encryptionKey')!;
    return EncryptionUtil.decryptFields(config, SENSITIVE_CONFIG_FIELDS, key);
  }

  /** Permanent failure for a destination type with no working connector (no Bull retry). */
  async markUnsupported(jobId: string, destinationType: StorageDestinationType) {
    await this.markPermanentFailure(
      jobId,
      `Tipo de destino '${destinationType}' ainda não é suportado para exportação sob demanda`,
    );
  }

  /** Permanent, non-retryable failure (no edge agent, unsupported destination, etc). */
  async markPermanentFailure(jobId: string, message: string) {
    const job = await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', lastError: message },
    });

    exportJobsTotal.inc({ status: 'FAILED', destination_type: job.destinationType });
    await this.appendLog(jobId, 'error', message);
    await this.auditService.log({
      tenantId: job.tenantId,
      clinicId: job.clinicId,
      action: 'EXPORT_FAILED',
      entityType: 'ExportJob',
      entityId: jobId,
      errorMessage: message,
    });

    this.exportGateway.emitToTenant(job.tenantId, 'export:failed', { jobId, tenantId: job.tenantId, success: false, error: message });
  }

  /** Job was successfully dispatched to the owning edge agent. */
  async markDispatched(jobId: string) {
    const job = await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    await this.appendLog(jobId, 'info', 'Dispatched to edge agent');
    this.exportGateway.emitToTenant(job.tenantId, 'export:started', { jobId, tenantId: job.tenantId });
  }

  async logAgentOffline(jobId: string) {
    await this.appendLog(jobId, 'warn', 'Edge agent offline — will retry');
  }

  async updateProgress(event: ExportProgressEvent) {
    const job = await this.prisma.exportJob.update({
      where: { id: event.jobId },
      data: {
        filesProcessed: event.filesProcessed,
        fileCount: event.fileCount,
        bytesTransferred: event.bytesTransferred,
        totalSizeBytes: event.totalSizeBytes,
        progressPercent: event.progressPercent,
      },
    });

    this.exportGateway.emitToTenant(job.tenantId, 'export:progress', event);
  }

  async markCompleted(jobId: string) {
    const job = await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', completedAt: new Date(), progressPercent: 100 },
    });

    exportJobsTotal.inc({ status: 'COMPLETED', destination_type: job.destinationType });

    await this.prisma.study.update({
      where: { id: job.studyId },
      data: { exportedAt: new Date(), lastExportStatus: 'COMPLETED' },
    });

    await this.appendLog(jobId, 'info', 'Export completed successfully');
    await this.auditService.log({
      tenantId: job.tenantId,
      clinicId: job.clinicId,
      action: 'EXPORT_COMPLETED',
      entityType: 'ExportJob',
      entityId: jobId,
      newValues: { studyId: job.studyId, destinationType: job.destinationType },
    });

    this.eventEmitter.emit('export.completed', {
      tenantId: job.tenantId,
      clinicId: job.clinicId,
      studyId: job.studyId,
      jobId,
      destinationType: job.destinationType,
    });

    this.exportGateway.emitToTenant(job.tenantId, 'export:completed', { jobId, tenantId: job.tenantId, success: true });
  }

  async markFailedOrRetry(jobId: string, errorMessage: string) {
    const current = await this.prisma.exportJob.findUniqueOrThrow({ where: { id: jobId } });
    const nextAttempts = current.attempts + 1;

    if (nextAttempts < current.maxAttempts) {
      const delay = Math.min(30000 * 2 ** current.attempts, 15 * 60 * 1000);

      const job = await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: 'RETRYING',
          attempts: nextAttempts,
          lastError: errorMessage,
          nextRetryAt: new Date(Date.now() + delay),
        },
      });

      await this.appendLog(jobId, 'warn', `Export failed (attempt ${nextAttempts}/${current.maxAttempts}): ${errorMessage}`);
      await this.exportQueue.add('process-export', { jobId }, { delay });

      this.exportGateway.emitToTenant(job.tenantId, 'export:retrying', { jobId, tenantId: job.tenantId, attempts: nextAttempts });
      return;
    }

    const job = await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', attempts: nextAttempts, lastError: errorMessage },
    });

    exportJobsTotal.inc({ status: 'FAILED', destination_type: job.destinationType });
    await this.appendLog(jobId, 'error', `Export failed permanently: ${errorMessage}`);
    await this.auditService.log({
      tenantId: job.tenantId,
      clinicId: job.clinicId,
      action: 'EXPORT_FAILED',
      entityType: 'ExportJob',
      entityId: jobId,
      errorMessage,
    });

    this.exportGateway.emitToTenant(job.tenantId, 'export:failed', { jobId, tenantId: job.tenantId, success: false, error: errorMessage });
  }

  private async appendLog(exportJobId: string, level: 'info' | 'warn' | 'error', message: string) {
    await this.prisma.exportJobLog.create({
      data: { exportJobId, level, message },
    }).catch((err) => this.logger.warn(`Failed to write export log: ${(err as Error).message}`));
  }
}
