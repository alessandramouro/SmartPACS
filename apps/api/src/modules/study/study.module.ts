import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

import { StudyController } from './study.controller';
import { StudyService } from './study.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [StudyController],
  providers: [StudyService],
  exports: [StudyService],
})
export class StudyModule {}
