import './tracing'; // OpenTelemetry — must be first import

// Prisma returns BigInt for some fields — patch global JSON serialization
(BigInt.prototype as any).toJSON = function () { return Number(this); };

import * as fs from 'fs';
import * as path from 'path';

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { logger } from './common/logger/winston.logger';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3001);
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');
  const appUrl = configService.get<string>('app.url', 'http://localhost:3000');
  const apiUrl = configService.get<string>('app.apiUrl', 'http://localhost:3001');

  // ─── Security Middleware ─────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production',
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(compression());
  app.use(cookieParser());
  app.use(RequestIdMiddleware);

  // STOW-RS bodies (multipart/related DICOM) must arrive as a raw Buffer,
  // not parsed by the default JSON/urlencoded body parsers.
  app.use('/api/v1/agents/:id/dicomweb/studies', express.raw({ type: () => true, limit: '512mb' }));

  // ─── Static Files (uploads) ──────────────────────────────────
  const storagePath = configService.get<string>('storage.localPath', './storage');
  const uploadsDir = path.join(process.cwd(), storagePath, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  // ─── CORS ───────────────────────────────────────────────────
  app.enableCors({
    origin: [
      appUrl,
      'http://localhost:3000',
      'http://localhost:3002', // Edge agent local
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Tenant-ID',
      'X-Agent-API-Key',
    ],
  });

  // ─── API Versioning ──────────────────────────────────────────
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // ─── Global Pipes ────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Global Filters ──────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ─── Global Interceptors ─────────────────────────────────────
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // ─── Swagger Documentation ───────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SmartPACS API')
      .setDescription(
        `## SmartPACS Enterprise Medical Imaging SaaS API

Multi-tenant platform for managing DICOM studies from medical imaging equipment.

### Authentication
Use JWT Bearer token: \`Authorization: Bearer <token>\`

### Multi-tenancy
Include tenant context via JWT claims or \`X-Tenant-ID\` header.

### Rate Limiting
- Standard endpoints: 100 req/min
- Auth endpoints: 10 req/min
- Upload endpoints: 20 req/min
`,
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addApiKey({ type: 'apiKey', name: 'X-Agent-API-Key', in: 'header' }, 'Agent-API-Key')
      .addTag('auth', 'Authentication & Authorization')
      .addTag('tenants', 'Tenant Management')
      .addTag('clinics', 'Clinic Management')
      .addTag('users', 'User Management')
      .addTag('studies', 'DICOM Study Management')
      .addTag('exports', 'Export Job Management')
      .addTag('storage', 'Storage Destination Configuration')
      .addTag('agents', 'Edge Agent Management')
      .addTag('notifications', 'Notification Management')
      .addTag('audit', 'Audit Logs')
      .addTag('webhooks', 'Webhook Configuration')
      .addTag('health', 'Health Checks')
      .addTag('metrics', 'Metrics & Observability')
      .addServer(apiUrl, 'Current environment')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
      customSiteTitle: 'SmartPACS API Docs',
    });

    logger.info(`Swagger available at: ${apiUrl}/docs`);
  }

  // ─── Health Check & Metrics Endpoint ─────────────────────────
  app.setGlobalPrefix('', { exclude: ['health', 'metrics', 'docs'] });

  await app.listen(port);

  logger.info(`SmartPACS API running in ${nodeEnv} mode`);
  logger.info(`API listening on: ${apiUrl}`);
  logger.info(`API docs:         ${apiUrl}/docs`);
  logger.info(`Health check:     ${apiUrl}/health`);
}

bootstrap().catch((err) => {
  console.error('Failed to start SmartPACS API:', err);
  process.exit(1);
});
