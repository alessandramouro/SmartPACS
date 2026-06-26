import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtPayload } from '@smartpacs/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/roles.decorator';

import { ClinicService } from './clinic.service';
import { ClinicQueryDto } from './dto/clinic-query.dto';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { UpsertStorageDestinationDto } from './dto/upsert-storage-destination.dto';

@ApiTags('clinics')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'clinics', version: '1' })
export class ClinicController {
  constructor(private readonly clinicService: ClinicService) {}

  @Get()
  @RequirePermissions('clinics:read')
  @ApiOperation({ summary: 'List clinics' })
  findAll(@Query() query: ClinicQueryDto, @CurrentUser() user: JwtPayload) {
    return this.clinicService.findAll(query, user);
  }

  @Get(':id')
  @RequirePermissions('clinics:read')
  @ApiOperation({ summary: 'Get clinic details with agents and destinations' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.clinicService.findById(id, user);
  }

  @Post()
  @RequirePermissions('clinics:write')
  @ApiOperation({ summary: 'Create clinic' })
  create(@Body() dto: CreateClinicDto, @CurrentUser() user: JwtPayload) {
    return this.clinicService.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('clinics:write')
  @ApiOperation({ summary: 'Update clinic settings' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClinicDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinicService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('clinics:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete clinic (only if no studies)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.clinicService.remove(id, user);
  }

  // ─── Storage Destinations ─────────────────────────────────

  @Get(':id/storage')
  @RequirePermissions('storage:read')
  @ApiOperation({ summary: 'List storage destinations for clinic' })
  getStorage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.clinicService.getStorageDestinations(id, user);
  }

  @Post(':id/storage')
  @RequirePermissions('storage:configure')
  @ApiOperation({ summary: 'Create or update storage destination' })
  upsertStorage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertStorageDestinationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinicService.upsertStorageDestination(id, dto, user);
  }

  @Delete(':id/storage/:destinationId')
  @RequirePermissions('storage:configure')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete storage destination' })
  deleteStorage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('destinationId', ParseUUIDPipe) destinationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinicService.deleteStorageDestination(id, destinationId, user);
  }
}
