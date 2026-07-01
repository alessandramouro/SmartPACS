import { Readable } from 'stream';

import { Controller, ForbiddenException, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '@smartpacs/types';
import { Request, Response } from 'express';

import { Public } from '../../common/decorators/roles.decorator';
import { DicomwebAccessGuard, ViewerAccess } from '../../common/guards/dicomweb-access.guard';
import { findAccessibleStudyByUid } from '../../common/utils/study-access.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

import { OrthancClientService } from './orthanc-client.service';

type AuthorizedRequest = Request & { user?: JwtPayload; viewerAccess?: ViewerAccess };

/**
 * QIDO-RS/WADO-RS pass-through to the central Orthanc, authorized per study
 * via DicomwebAccessGuard (normal user JWT or a single-study viewer token).
 * Studies are never browsed freely here -- every request must name a
 * StudyInstanceUID that the caller is verified to have access to.
 */
@ApiTags('dicomweb')
@Controller({ path: 'dicomweb', version: '1' })
@Public()
@UseGuards(DicomwebAccessGuard)
export class DicomwebProxyController {
  constructor(
    private readonly orthancClient: OrthancClientService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Get('studies')
  @ApiOperation({ summary: 'QIDO-RS study-level search (single StudyInstanceUID only), proxied to Orthanc' })
  async qidoStudies(
    @Req() req: AuthorizedRequest,
    @Res() res: Response,
    @Query('StudyInstanceUID') studyInstanceUid?: string,
  ) {
    await this.authorizeStudy(req, studyInstanceUid);
    await this.proxy('studies', req, res);
  }

  @Get('studies/:uid/*')
  @ApiOperation({ summary: 'WADO-RS metadata/series/instances/frames for one study, proxied to Orthanc' })
  async wadoStudyResource(
    @Req() req: AuthorizedRequest,
    @Res() res: Response,
    @Param('uid') uid: string,
  ) {
    await this.authorizeStudy(req, uid);
    const rest = (req.params as Record<string, string>)['0'] ?? '';
    await this.proxy(`studies/${uid}/${rest}`, req, res);
  }

  // Path-token variants: OHIF's DICOMweb client builds its own request URLs
  // from a static qidoRoot/wadoRoot and never forwards the page URL's own
  // query string, so the viewer token is baked into the configured root
  // ("/dicomweb/t/<token>/...") instead of relying on a ?token= query param.
  @Get('t/:token/studies')
  @ApiOperation({ summary: 'QIDO-RS study-level search using a path-embedded viewer token' })
  async qidoStudiesWithPathToken(
    @Req() req: AuthorizedRequest,
    @Res() res: Response,
    @Query('StudyInstanceUID') studyInstanceUid?: string,
  ) {
    await this.authorizeStudy(req, studyInstanceUid);
    await this.proxy('studies', req, res);
  }

  @Get('t/:token/studies/:uid/*')
  @ApiOperation({ summary: 'WADO-RS resources using a path-embedded viewer token' })
  async wadoStudyResourceWithPathToken(
    @Req() req: AuthorizedRequest,
    @Res() res: Response,
    @Param('uid') uid: string,
  ) {
    await this.authorizeStudy(req, uid);
    const rest = (req.params as Record<string, string>)['0'] ?? '';
    await this.proxy(`studies/${uid}/${rest}`, req, res);
  }

  private async authorizeStudy(req: AuthorizedRequest, studyInstanceUid?: string): Promise<void> {
    if (!studyInstanceUid) throw new ForbiddenException('StudyInstanceUID is required');

    if (req.viewerAccess) {
      if (req.viewerAccess.studyInstanceUid !== studyInstanceUid) {
        throw new ForbiddenException('Viewer token does not grant access to this study');
      }
      this.auditService.log({
        tenantId: req.viewerAccess.tenantId,
        action: 'STUDY_VIEWED',
        entityType: 'Study',
        entityId: studyInstanceUid,
        ipAddress: req.ip,
        metadata: { via: 'viewer_token' },
        success: true,
      }).catch(() => null);
      return;
    }

    await findAccessibleStudyByUid(this.prisma, studyInstanceUid, req.user!);
    this.auditService.log({
      tenantId: req.user!.tenantId,
      userId: req.user!.sub,
      action: 'STUDY_VIEWED',
      entityType: 'Study',
      entityId: studyInstanceUid,
      ipAddress: req.ip,
      metadata: { via: 'user_jwt' },
      success: true,
    }).catch(() => null);
  }

  private async proxy(path: string, req: Request, res: Response): Promise<void> {
    const qs = req.url.split('?')[1];
    const search = qs ? `?${qs}` : '';

    const { status, headers, body } = await this.orthancClient.forwardDicomweb(path, search, req.headers.accept);

    res.status(status);
    headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') res.setHeader(key, value);
    });

    if (!body) {
      res.end();
      return;
    }
    Readable.fromWeb(body as never).pipe(res);
  }
}
