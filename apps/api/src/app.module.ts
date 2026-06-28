import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import { configValidationSchema } from './config/config.validation';
import databaseConfig from './config/database.config';
import emailConfig from './config/email.config';
import oauthConfig from './config/oauth.config';
import orthancConfig from './config/orthanc.config';
import redisConfig from './config/redis.config';
import storageConfig from './config/storage.config';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClinicModule } from './modules/clinic/clinic.module';
import { DicomwebModule } from './modules/dicomweb/dicomweb.module';
import { EdgeAgentModule } from './modules/edge-agent/edge-agent.module';
import { ExportModule } from './modules/export/export.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OAuthModule } from './modules/oauth/oauth.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StorageModule } from './modules/storage/storage.module';
import { StudyModule } from './modules/study/study.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UploadModule } from './modules/upload/upload.module';
import { UserModule } from './modules/user/user.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // ─── Configuration ─────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig, databaseConfig, authConfig, redisConfig, storageConfig,
        emailConfig, oauthConfig, orthancConfig,
      ],
      validationSchema: configValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // ─── Rate Limiting ──────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 50,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // ─── Events ─────────────────────────────────────────────────
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),

    // ─── Scheduler ──────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ─── Queue (Bull + Redis) ────────────────────────────────────
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || undefined,
          db: parseInt(process.env.REDIS_DB || '0', 10),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
    }),

    // ─── Core ───────────────────────────────────────────────────
    PrismaModule,

    // ─── Feature Modules ────────────────────────────────────────
    AuthModule,
    TenantModule,
    ClinicModule,
    UserModule,
    StudyModule,
    DicomwebModule,
    ExportModule,
    NotificationModule,
    EdgeAgentModule,
    StorageModule,
    AuditModule,
    WebhookModule,
    OAuthModule,
    UploadModule,
    SettingsModule,
    RealtimeModule,

    // ─── Observability ──────────────────────────────────────────
    HealthModule,
    MetricsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
