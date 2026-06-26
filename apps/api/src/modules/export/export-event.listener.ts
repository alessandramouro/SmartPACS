import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ExportProgressEvent, ExportResultEvent } from '@smartpacs/types';

import { ExportService } from './export.service';

/**
 * Persists progress/result events reported by edge agents through ExportGateway.
 * Decoupled via EventEmitter2 so RealtimeModule never needs to import ExportModule.
 */
@Injectable()
export class ExportEventListener {
  constructor(private readonly exportService: ExportService) {}

  @OnEvent('export.agent_progress')
  async onAgentProgress(payload: ExportProgressEvent) {
    await this.exportService.updateProgress(payload);
  }

  @OnEvent('export.agent_result')
  async onAgentResult(payload: ExportResultEvent) {
    if (payload.success) {
      await this.exportService.markCompleted(payload.jobId);
    } else {
      await this.exportService.markFailedOrRetry(payload.jobId, payload.error || 'Unknown error');
    }
  }
}
