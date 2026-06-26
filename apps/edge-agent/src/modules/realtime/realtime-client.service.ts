import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ExportCommandPayload,
  ExportProgressEvent,
  ExportResultEvent,
} from '@smartpacs/types';
import { io, Socket } from 'socket.io-client';

import { ExportHandlerService } from './export-handler.service';

/**
 * Outbound-only connection to the cloud's /realtime gateway, mirroring the
 * existing HTTP-poll tolerance for outages (socket.io-client's default
 * reconnection backoff) — there is no inbound channel exposed by the agent.
 */
@Injectable()
export class RealtimeClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeClientService.name);
  private socket?: Socket;

  constructor(
    private readonly configService: ConfigService,
    private readonly exportHandler: ExportHandlerService,
  ) {}

  onModuleInit() {
    const agentId = this.configService.get<string>('agent.agentId');
    const apiKey = this.configService.get<string>('agent.apiKey');
    const cloudApiUrl = this.configService.get<string>('agent.cloudApiUrl');

    if (!agentId || !apiKey) {
      this.logger.warn('Agent not registered (missing agentId/apiKey) — realtime channel disabled');
      return;
    }

    this.socket = io(`${cloudApiUrl}/realtime`, {
      auth: { agentId, apiKey },
      reconnection: true,
      transports: ['websocket'],
    });

    this.socket.on('connect', () => this.logger.log('Connected to cloud realtime channel'));
    this.socket.on('disconnect', (reason) => this.logger.warn(`Realtime channel disconnected: ${reason}`));
    this.socket.on('connect_error', (err) => this.logger.debug(`Realtime connect error: ${err.message}`));

    this.socket.on('export:command', (payload: ExportCommandPayload) => {
      this.logger.log(`Received export command for job ${payload.jobId}`);
      this.exportHandler
        .handle(payload, {
          progress: (event) => this.emitProgress(event),
          result: (event) => this.emitResult(event),
        })
        .catch((err) => this.logger.error(`Export handler crashed: ${(err as Error).message}`));
    });
  }

  onModuleDestroy() {
    this.socket?.disconnect();
  }

  emitProgress(event: ExportProgressEvent) {
    this.socket?.emit('export:progress', event);
  }

  emitResult(event: ExportResultEvent) {
    this.socket?.emit('export:result', event);
  }
}
