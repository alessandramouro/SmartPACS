import { Controller, Get, Post, Param, Query, Req, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtPayload } from '@smartpacs/types';
import { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/roles.decorator';

import { StudyQueryDto } from './dto/study-query.dto';
import { StudyService } from './study.service';

@ApiTags('studies')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'studies', version: '1' })
export class StudyController {
  constructor(private readonly studyService: StudyService) {}

  @Get()
  @RequirePermissions('studies:read')
  @ApiOperation({ summary: 'Search and filter DICOM studies' })
  findAll(@Query() query: StudyQueryDto, @CurrentUser() user: JwtPayload) {
    return this.studyService.findAll(query, user);
  }

  @Get('stats')
  @RequirePermissions('studies:read')
  @ApiOperation({ summary: 'Get study statistics for dashboard' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.studyService.getStats(user);
  }

  @Get(':id')
  @RequirePermissions('studies:read')
  @ApiOperation({ summary: 'Get full study details with files and export history' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.studyService.findById(id, user);
  }

  @Post(':id/viewer-token')
  @RequirePermissions('studies:read')
  @ApiOperation({ summary: 'Mint a short-lived single-study token for the OHIF viewer' })
  createViewerToken(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.studyService.createViewerToken(id, user, req.ip);
  }
}
