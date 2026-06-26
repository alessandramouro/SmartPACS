import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtPayload } from '@smartpacs/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, RequirePermissions } from '../../common/decorators/roles.decorator';

import { TenantService } from './tenant.service';

@ApiTags('tenants')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'tenants', version: '1' })
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '[Super Admin] List all tenants' })
  findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.tenantService.findAll({ page, limit });
  }

  @Get(':id')
  @RequirePermissions('tenants:read')
  @ApiOperation({ summary: 'Get tenant details' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.tenantService.findById(id, user);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '[Super Admin] Create tenant with initial admin' })
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtPayload) {
    return this.tenantService.create(body as any, user);
  }

  @Put(':id')
  @RequirePermissions('tenants:write')
  @ApiOperation({ summary: 'Update tenant settings' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tenantService.update(id, body as any, user);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Super Admin] Delete tenant (soft)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.remove(id);
  }
}
