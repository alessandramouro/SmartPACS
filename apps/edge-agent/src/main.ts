import * as os from 'os';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import axios from 'axios';


import { AppModule } from './app.module';
import { readCredentials, writeCredentials } from './common/credentials-store';
import { logger } from './common/logger';
import { AgentStateService } from './modules/state/agent-state.service';

/**
 * Zero-touch provisioning: if no credentials are stored or configured yet but an
 * enrollment token is present, redeem it before the Nest app (and its config
 * factories, which read credentials synchronously) is ever constructed.
 */
async function ensureEnrolled() {
  if (readCredentials()) return;
  if (process.env.EDGE_AGENT_ID && process.env.EDGE_AGENT_API_KEY) return;

  const token = process.env.EDGE_AGENT_ENROLLMENT_TOKEN;
  if (!token) return;

  const cloudApiUrl = process.env.CLOUD_API_URL || 'http://localhost:3001';

  try {
    const res = await axios.post(`${cloudApiUrl}/api/v1/agents/enroll`, {
      token,
      version: process.env.npm_package_version || '1.0.0',
      hostname: os.hostname(),
      platform: os.platform(),
      osVersion: os.release(),
      dicomConfig: {
        aeTitle: process.env.DICOM_AE_TITLE || 'SMARTPACS',
        port: parseInt(process.env.DICOM_SCP_PORT || '104', 10),
        allowedCallingAeTitles: (process.env.DICOM_ALLOWED_AE_TITLES || '').split(',').filter(Boolean),
        receiveDirectory: process.env.DICOM_RECEIVED_DIR || './storage/received',
        processedDirectory: process.env.DICOM_PROCESSED_DIR || './storage/processed',
        failedDirectory: process.env.DICOM_FAILED_DIR || './storage/failed',
      },
    });

    const { agentId, apiKey } = res.data?.data || {};
    if (!agentId || !apiKey) throw new Error('Enrollment response missing agentId/apiKey');

    writeCredentials({ agentId, apiKey });
    logger.info(`Enrolled successfully via provisioning token — agentId: ${agentId}`);
  } catch (err) {
    logger.error(`Enrollment failed: ${(err as Error).message}`);
  }
}

async function bootstrap() {
  await ensureEnrolled();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('agent.httpPort', 3002);

  await app.listen(port);

  // Initialize agent and register with cloud API
  const stateService = app.get(AgentStateService);
  await stateService.initialize();

  logger.info(`SmartPACS Edge Agent running on port ${port}`);
  logger.info(`Agent ID: ${configService.get('agent.agentId') || 'unregistered'}`);
  logger.info(`DICOM SCP: AE=${configService.get('dicom.aeTitle')} PORT=${configService.get('dicom.port')}`);
}

bootstrap().catch((err) => {
  console.error('Edge Agent failed to start:', err);
  process.exit(1);
});
