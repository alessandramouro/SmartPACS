import {
  BadRequestException, Controller, Headers, Param, ParseUUIDPipe, Post, Query, Req,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { OrthancForwardResult } from '@smartpacs/types';
import { Request } from 'express';

import { Public } from '../../common/decorators/roles.decorator';
import { EdgeAgentService } from '../edge-agent/edge-agent.service';

import { OrthancClientService } from './orthanc-client.service';

/**
 * Lets an edge agent push a study it already archived locally into the
 * central Orthanc, without ever holding central Orthanc credentials --
 * same trust boundary as the existing runtime-config endpoint, except the
 * API just relays bytes here instead of decrypting per-agent config.
 */
@ApiTags('dicomweb')
@Controller({ path: 'agents/:id/dicomweb', version: '1' })
export class DicomwebIngestController {
  constructor(
    private readonly edgeAgentService: EdgeAgentService,
    private readonly orthancClient: OrthancClientService,
  ) {}

  @Post('studies')
  @Public()
  @ApiSecurity('Agent-API-Key')
  @ApiOperation({ summary: '[AGENT] Forward a STOW-RS multipart study into the central Orthanc archive' })
  async stowStudy(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('studyInstanceUid') studyInstanceUid: string,
    @Headers('x-agent-api-key') apiKey: string,
    @Req() req: Request,
  ): Promise<OrthancForwardResult> {
    await this.edgeAgentService.validateApiKey(id, apiKey);

    if (!studyInstanceUid) throw new BadRequestException('studyInstanceUid query param is required');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('Expected a raw STOW-RS multipart/related body');
    }

    const contentType = req.headers['content-type'] ?? 'multipart/related';
    const { sopInstanceCount } = await this.orthancClient.stowStudy(body, contentType);
    const orthancStudyId = await this.orthancClient.lookupStudyId(studyInstanceUid);

    if (orthancStudyId) {
      await this.edgeAgentService.markStudyStoredInOrthanc(id, studyInstanceUid, orthancStudyId);
    }

    return { orthancStudyId: orthancStudyId ?? '', stowSopInstanceCount: sopInstanceCount };
  }
}
