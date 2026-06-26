import { Controller, Get, Post, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtPayload } from '@smartpacs/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { BulkExportDto } from './dto/bulk-export.dto';
import { ExportService } from './export.service';

@ApiTags('exports')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'exports', version: '1' })
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post('studies/:studyId/destinations/:destinationId')
  create(
    @Param('studyId', ParseUUIDPipe) studyId: string,
    @Param('destinationId', ParseUUIDPipe) destinationId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.exportService.createExportJob(studyId, destinationId, currentUser);
  }

  @Post('bulk')
  createBulk(@Body() dto: BulkExportDto, @CurrentUser() currentUser: JwtPayload) {
    return this.exportService.createBulkExportJobs(dto.studyIds, dto.destinationId, currentUser);
  }

  @Get('studies/:studyId')
  list(
    @Param('studyId', ParseUUIDPipe) studyId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.exportService.listExportJobs(studyId, currentUser);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.exportService.getExportJob(id, currentUser);
  }

  @Post(':id/retry')
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.exportService.retryExportJob(id, currentUser);
  }
}
