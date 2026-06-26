import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EdgeAgentHeartbeat } from '@smartpacs/types';
import axios, { AxiosInstance } from 'axios';

/**
 * CloudApiService — communicates with SmartPACS backend.
 * All requests authenticated via X-Agent-API-Key header.
 */
@Injectable()
export class CloudApiService {
  private readonly logger = new Logger(CloudApiService.name);
  private readonly client: AxiosInstance;
  private readonly agentId: string;

  constructor(private readonly configService: ConfigService) {
    this.agentId = configService.get<string>('agent.agentId', '');

    this.client = axios.create({
      baseURL: `${configService.get('agent.cloudApiUrl')}/api/v1`,
      headers: {
        'X-Agent-API-Key': configService.get<string>('agent.apiKey', ''),
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        this.logger.debug(`Cloud API error: ${err.response?.status} ${err.message}`);
        return Promise.reject(err);
      },
    );
  }

  async sendHeartbeat(payload: Omit<EdgeAgentHeartbeat, 'agentId' | 'version' | 'timestamp'>): Promise<void> {
    if (!this.agentId) return;

    await this.client.post(`/agents/${this.agentId}/heartbeat`, {
      ...payload,
      version: process.env.npm_package_version || '1.0.0',
    });
  }

  async reportStudy(study: Record<string, unknown>): Promise<{ id: string } | null> {
    if (!this.agentId) return null;

    try {
      const res = await this.client.post(`/agents/${this.agentId}/studies`, study);
      return res.data?.data || null;
    } catch (err) {
      this.logger.warn(`Failed to report study to cloud: ${(err as Error).message}`);
      return null;
    }
  }

  async getRemoteConfig(): Promise<Record<string, unknown> | null> {
    if (!this.agentId) return null;

    try {
      const res = await this.client.get(`/agents/${this.agentId}`);
      return res.data?.data?.remoteConfig || null;
    } catch {
      return null;
    }
  }

  async getStorageDestinations(): Promise<unknown[]> {
    if (!this.agentId) return [];

    try {
      const res = await this.client.get(`/agents/${this.agentId}/runtime-config`);
      return res.data?.data?.storageDestinations || [];
    } catch {
      return [];
    }
  }

  /** Cloud-managed worklist config — set on the clinic, gated by the tenant's plan. Null if unreachable/not enrolled. */
  async getWorklistConfig(): Promise<{ enabled: boolean; hisUrl?: string; aeTitle?: string } | null> {
    if (!this.agentId) return null;

    try {
      const res = await this.client.get(`/agents/${this.agentId}/runtime-config`);
      return res.data?.data?.worklist ?? null;
    } catch (err) {
      this.logger.debug(`Failed to fetch worklist config from cloud: ${(err as Error).message}`);
      return null;
    }
  }
}
