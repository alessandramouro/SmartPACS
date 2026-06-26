import { Injectable, Logger } from '@nestjs/common';
import type { DicomMetadata } from '@smartpacs/types';
import { v4 as uuidv4 } from 'uuid';

import { DatabaseService } from '../../database/database.service';

export interface QueueEnqueueOptions {
  studyId: string;
  filePath: string;
  fileSize: number;
  metadata?: Partial<DicomMetadata>;
}

export interface QueueItem {
  id: string;
  studyId: string;
  destinationId: string;
  destinationType: string;
  filePath: string;
  remotePath: string;
  fileSize: number;
  fileHash?: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  chunkOffset: number;
  uploadId?: string;
  createdAt: string;
  updatedAt: string;
  nextRetryAt?: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(private readonly database: DatabaseService) {}

  async enqueueFile(options: QueueEnqueueOptions): Promise<void> {
    const destinations = this.database.all(
      'SELECT * FROM sync_destinations WHERE is_active = 1',
    ) as Array<{ id: string; type: string; config: string }>;

    if (destinations.length === 0) {
      this.logger.warn(`No active destinations — file will remain pending: ${options.filePath}`);
      return;
    }

    this.database.transaction(() => {
      for (const dest of destinations) {
        const config = JSON.parse(dest.config || '{}');
        const remotePath = this.buildRemotePath(options.studyId, options.filePath, config);

        this.database.run(
          `INSERT OR IGNORE INTO queue_items
           (id, study_id, destination_id, destination_type, file_path, remote_path, file_size, status, max_attempts)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 5)`,
          uuidv4(),
          options.studyId,
          dest.id,
          dest.type,
          options.filePath,
          remotePath,
          options.fileSize,
        );
      }
    });
  }

  getPendingItems(limit = 10): QueueItem[] {
    const now = new Date().toISOString();
    return this.database.all(
      `SELECT * FROM queue_items
       WHERE status = 'PENDING'
          OR (status = 'FAILED' AND attempts < max_attempts AND (next_retry_at IS NULL OR next_retry_at <= ?))
       ORDER BY created_at ASC
       LIMIT ?`,
      now,
      limit,
    ) as QueueItem[];
  }

  markProcessing(id: string): void {
    this.database.run(
      `UPDATE queue_items SET status = 'UPLOADING', updated_at = datetime('now') WHERE id = ?`,
      id,
    );
  }

  markCompleted(id: string): void {
    this.database.run(
      `UPDATE queue_items SET status = 'COMPLETED', updated_at = datetime('now') WHERE id = ?`,
      id,
    );
  }

  markFailed(id: string, error: string): void {
    const item = this.database.get('SELECT * FROM queue_items WHERE id = ?', id) as QueueItem;
    if (!item) return;

    const attempts = (item.attempts || 0) + 1;
    const maxAttempts = item.maxAttempts || 5;

    const baseDelay = 60; // seconds
    const backoff = Math.min(baseDelay * Math.pow(2, attempts - 1), 3600);
    const nextRetryAt = new Date(Date.now() + backoff * 1000).toISOString();

    const newStatus = attempts >= maxAttempts ? 'FAILED' : 'FAILED';

    this.database.run(
      `UPDATE queue_items
       SET status = ?, attempts = ?, last_error = ?, next_retry_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
      newStatus,
      attempts,
      error.substring(0, 500),
      attempts < maxAttempts ? nextRetryAt : null,
      id,
    );
  }

  updateChunkProgress(id: string, offset: number, uploadId?: string): void {
    this.database.run(
      `UPDATE queue_items SET chunk_offset = ?, upload_id = ?, updated_at = datetime('now') WHERE id = ?`,
      offset,
      uploadId || null,
      id,
    );
  }

  getStats() {
    const rows = this.database.all(
      `SELECT status, COUNT(*) as count, SUM(file_size) as total_size
       FROM queue_items GROUP BY status`,
    ) as Array<{ status: string; count: number; total_size: number }>;

    return Object.fromEntries(rows.map((r) => [r.status, { count: r.count, totalSize: r.total_size || 0 }]));
  }

  private buildRemotePath(studyId: string, filePath: string, config: Record<string, unknown>): string {
    const basePath = (config.folderPath as string) || '/SmartPACS';
    const fileName = filePath.split(/[/\\]/).pop() || 'file.dcm';
    return `${basePath}/studies/${studyId}/${fileName}`;
  }
}
