import { Injectable, Logger } from '@nestjs/common';
import type {
  ExportCommandPayload,
  ExportProgressEvent,
  ExportResultEvent,
} from '@smartpacs/types';
import * as fs from 'fs-extra';

import { DatabaseService } from '../../database/database.service';
import { AnonymizationService } from '../anonymization/anonymization.service';
import { GoogleDriveConnector } from '../sync-engine/connectors/google-drive.connector';
import { OneDriveConnector } from '../sync-engine/connectors/onedrive.connector';
import { SmbConnector } from '../sync-engine/connectors/smb.connector';
import type { UploadConnector } from '../sync-engine/sync-engine.service';

interface LocalStudyRow {
  id: string;
  cloud_study_id: string | null;
  patient_id: string | null;
}

interface LocalDicomFileRow {
  id: string;
  file_path: string;
  file_size: number;
}

export interface ExportEmitters {
  progress: (event: ExportProgressEvent) => void;
  result: (event: ExportResultEvent) => void;
}

/**
 * Handles an on-demand export command received from the cloud over the
 * realtime channel. Only GOOGLE_DRIVE/ONEDRIVE/SMB are supported — the cloud
 * processor already filters destination types before ever dispatching here.
 */
@Injectable()
export class ExportHandlerService {
  private readonly logger = new Logger(ExportHandlerService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly googleDrive: GoogleDriveConnector,
    private readonly oneDrive: OneDriveConnector,
    private readonly smb: SmbConnector,
    private readonly anonymization: AnonymizationService,
  ) {}

  async handle(payload: ExportCommandPayload, emit: ExportEmitters): Promise<void> {
    const study = this.database.get(
      'SELECT * FROM studies WHERE cloud_study_id = ?',
      payload.studyId,
    ) as LocalStudyRow | undefined;

    if (!study) {
      emit.result({
        jobId: payload.jobId,
        tenantId: payload.tenantId,
        success: false,
        error: 'Estudo não encontrado neste agente',
      });
      return;
    }

    const files = this.database.all(
      'SELECT * FROM dicom_files WHERE study_id = ?',
      study.id,
    ) as LocalDicomFileRow[];

    if (files.length === 0) {
      emit.result({
        jobId: payload.jobId,
        tenantId: payload.tenantId,
        success: false,
        error: 'Nenhum arquivo encontrado para este estudo',
      });
      return;
    }

    const connector = this.getConnector(payload.destination.type);
    if (!connector) {
      emit.result({
        jobId: payload.jobId,
        tenantId: payload.tenantId,
        success: false,
        error: `Conector não disponível para o tipo de destino: ${payload.destination.type}`,
      });
      return;
    }

    const totalSizeBytes = files.reduce((sum, f) => sum + (f.file_size || 0), 0);
    let bytesTransferred = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const remotePath = this.buildRemotePath(payload, file.file_path);

        let uploadPath = file.file_path;
        let anonymizedTempPath: string | null = null;

        if (payload.anonymize) {
          anonymizedTempPath = await this.anonymization.anonymize(file.file_path, study.patient_id);
          uploadPath = anonymizedTempPath;
        }

        try {
          await connector.upload(uploadPath, remotePath, payload.destination.config);
        } finally {
          if (anonymizedTempPath) await fs.remove(anonymizedTempPath).catch(() => undefined);
        }

        bytesTransferred += file.file_size || 0;

        emit.progress({
          jobId: payload.jobId,
          tenantId: payload.tenantId,
          filesProcessed: i + 1,
          fileCount: files.length,
          bytesTransferred,
          totalSizeBytes,
          progressPercent: Math.round(((i + 1) / files.length) * 100),
        });
      }

      emit.result({
        jobId: payload.jobId,
        tenantId: payload.tenantId,
        success: true,
        fileCount: files.length,
        bytesTransferred,
      });
    } catch (err) {
      this.logger.warn(`Export failed for job ${payload.jobId}: ${(err as Error).message}`);
      emit.result({
        jobId: payload.jobId,
        tenantId: payload.tenantId,
        success: false,
        error: (err as Error).message,
      });
    }
  }

  private getConnector(type: string): UploadConnector | null {
    switch (type) {
      case 'GOOGLE_DRIVE': return this.googleDrive;
      case 'ONEDRIVE': return this.oneDrive;
      case 'SMB': return this.smb;
      default: return null;
    }
  }

  /** Cloud-UUID-keyed path — distinct from QueueService's local-row-id convention. */
  private buildRemotePath(payload: ExportCommandPayload, filePath: string): string {
    const basePath = payload.destinationPath || '/SmartPACS';
    const fileName = filePath.split(/[/\\]/).pop() || 'file.dcm';
    return `${basePath}/studies/${payload.studyId}/${fileName}`;
  }
}
