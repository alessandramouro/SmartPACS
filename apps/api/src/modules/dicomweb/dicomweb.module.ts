import { Module } from '@nestjs/common';

import { DicomwebAccessGuard } from '../../common/guards/dicomweb-access.guard';
import { AuthModule } from '../auth/auth.module';
import { EdgeAgentModule } from '../edge-agent/edge-agent.module';

import { DicomwebIngestController } from './dicomweb-ingest.controller';
import { DicomwebProxyController } from './dicomweb-proxy.controller';
import { OrthancClientService } from './orthanc-client.service';

@Module({
  imports: [AuthModule, EdgeAgentModule],
  controllers: [DicomwebProxyController, DicomwebIngestController],
  providers: [OrthancClientService, DicomwebAccessGuard],
})
export class DicomwebModule {}
