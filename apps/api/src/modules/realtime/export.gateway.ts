import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { JwtPayload, ExportCommandPayload, ExportProgressEvent, ExportResultEvent } from '@smartpacs/types';
import { Server, Socket } from 'socket.io';

import { Public } from '../../common/decorators/roles.decorator';
import { edgeAgentsConnected } from '../../common/metrics/app-metrics';
import { PrismaService } from '../../prisma/prisma.service';
import { EdgeAgentService } from '../edge-agent/edge-agent.service';

/**
 * Single gateway serving two kinds of clients on the same /realtime namespace:
 * browser dashboards (auth: { token }) joining `tenant:{tenantId}`, and edge
 * agents (auth: { agentId, apiKey }) joining `agent:{agentId}`. Auth is fully
 * manual in handleConnection — @Public() bypasses the global JwtAuthGuard,
 * which would otherwise break on a ws ExecutionContext.
 */
@Public()
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: [
      process.env.APP_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:3002',
    ],
    credentials: true,
  },
})
export class ExportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ExportGateway.name);
  private readonly agentSockets = new Map<string, string>();

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly edgeAgentService: EdgeAgentService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleConnection(client: Socket) {
    const auth = client.handshake.auth as Record<string, string>;

    try {
      if (auth.token) {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(auth.token, {
          secret: this.configService.get<string>('auth.jwtSecret'),
          issuer: 'smartpacs',
          audience: 'smartpacs-api',
        });

        const session = await this.prisma.userSession.findFirst({
          where: { userId: payload.sub, isRevoked: false },
        });
        if (!session) throw new Error('Session revoked or expired');

        client.data.user = payload;
        await client.join(`tenant:${payload.tenantId}`);
        this.logger.debug(`Browser client connected: user=${payload.sub}`);
        return;
      }

      if (auth.agentId && auth.apiKey) {
        await this.edgeAgentService.validateApiKey(auth.agentId, auth.apiKey);

        client.data.agentId = auth.agentId;
        this.agentSockets.set(auth.agentId, client.id);
        edgeAgentsConnected.set(this.agentSockets.size);
        await client.join(`agent:${auth.agentId}`);
        this.logger.log(`Edge agent connected: ${auth.agentId}`);
        return;
      }

      throw new Error('Missing auth payload');
    } catch (err) {
      this.logger.warn(`WS connection rejected: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const agentId = client.data?.agentId as string | undefined;
    if (agentId && this.agentSockets.get(agentId) === client.id) {
      this.agentSockets.delete(agentId);
      edgeAgentsConnected.set(this.agentSockets.size);
      this.logger.log(`Edge agent disconnected: ${agentId}`);
    }
  }

  /** Returns whether the target agent currently has a live socket. */
  dispatchExportCommand(agentId: string, payload: ExportCommandPayload): boolean {
    const isOnline = this.agentSockets.has(agentId);
    this.server.to(`agent:${agentId}`).emit('export:command', payload);
    return isOnline;
  }

  emitToTenant(tenantId: string, event: string, payload: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, payload);
  }

  @SubscribeMessage('export:progress')
  handleProgress(@MessageBody() payload: ExportProgressEvent, @ConnectedSocket() client: Socket) {
    if (!client.data?.agentId) return;
    this.eventEmitter.emit('export.agent_progress', payload);
  }

  @SubscribeMessage('export:result')
  handleResult(@MessageBody() payload: ExportResultEvent, @ConnectedSocket() client: Socket) {
    if (!client.data?.agentId) return;
    this.eventEmitter.emit('export.agent_result', payload);
  }
}
