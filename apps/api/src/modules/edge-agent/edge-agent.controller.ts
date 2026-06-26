import {
  Controller, Get, Post, Delete,
  Body, Param, Query, Headers, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtPayload } from '@smartpacs/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, Public } from '../../common/decorators/roles.decorator';
import { IngestStudyDto } from '../study/dto/ingest-study.dto';

import { AgentQueryDto } from './dto/agent-query.dto';
import { CreateEnrollmentTokenDto } from './dto/create-enrollment-token.dto';
import { EnrollAgentDto } from './dto/enroll-agent.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { RegisterAgentDto } from './dto/register-agent.dto';
import { EdgeAgentService } from './edge-agent.service';

@ApiTags('agents')
@Controller({ path: 'agents', version: '1' })
export class EdgeAgentController {
  constructor(private readonly edgeAgentService: EdgeAgentService) {}

  // ─── Admin endpoints (JWT auth) ───────────────────────────────

  @Get()
  @ApiBearerAuth('JWT-auth')
  @RequirePermissions('clinics:read')
  @ApiOperation({ summary: 'List edge agents (tenant-scoped)' })
  findAll(@Query() query: AgentQueryDto, @CurrentUser() user: JwtPayload) {
    return this.edgeAgentService.findAll(query, user);
  }

  @Post()
  @ApiBearerAuth('JWT-auth')
  @RequirePermissions('clinics:write')
  @ApiOperation({ summary: 'Register new edge agent — returns API key (shown once)' })
  register(@Body() dto: RegisterAgentDto, @CurrentUser() user: JwtPayload) {
    return this.edgeAgentService.register(dto, user);
  }

  @Get(':id')
  @ApiBearerAuth('JWT-auth')
  @RequirePermissions('clinics:read')
  @ApiOperation({ summary: 'Get edge agent by ID' })
  findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.edgeAgentService.findById(id, user);
  }

  @Get(':id/config')
  @ApiBearerAuth('JWT-auth')
  @RequirePermissions('clinics:read')
  @ApiOperation({ summary: 'Get agent remote config and storage destinations' })
  getConfig(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.edgeAgentService.getAgentConfig(id, user);
  }

  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @RequirePermissions('clinics:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke edge agent' })
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.edgeAgentService.revokeAgent(id, user);
  }

  @Post('enrollment-tokens')
  @ApiBearerAuth('JWT-auth')
  @RequirePermissions('clinics:write')
  @ApiOperation({ summary: 'Generate a one-time agent enrollment token (shown once)' })
  createEnrollmentToken(@Body() dto: CreateEnrollmentTokenDto, @CurrentUser() user: JwtPayload) {
    return this.edgeAgentService.createEnrollmentToken(dto, user);
  }

  // ─── Agent endpoints (API Key auth) ──────────────────────────

  @Post('enroll')
  @Public()
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '[AGENT] Redeem a one-time enrollment token — returns API key (shown once)' })
  enroll(@Body() dto: EnrollAgentDto) {
    return this.edgeAgentService.enroll(dto);
  }

  @Get(':id/runtime-config')
  @Public()
  @ApiSecurity('Agent-API-Key')
  @ApiOperation({ summary: '[AGENT] Get decrypted storage destination credentials for sync' })
  async getRuntimeConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-agent-api-key') apiKey: string,
  ) {
    await this.edgeAgentService.validateApiKey(id, apiKey);
    return this.edgeAgentService.getRuntimeConfig(id);
  }

  @Post(':id/heartbeat')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiSecurity('Agent-API-Key')
  @ApiOperation({ summary: '[AGENT] Send heartbeat with metrics and queue stats' })
  async heartbeat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HeartbeatDto,
    @Headers('x-agent-api-key') apiKey: string,
  ) {
    await this.edgeAgentService.validateApiKey(id, apiKey);
    await this.edgeAgentService.heartbeat(id, dto);
  }

  @Post(':id/studies')
  @Public()
  @ApiSecurity('Agent-API-Key')
  @ApiOperation({ summary: '[AGENT] Report received DICOM study' })
  async reportStudy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IngestStudyDto,
    @Headers('x-agent-api-key') apiKey: string,
  ) {
    await this.edgeAgentService.validateApiKey(id, apiKey);
    return this.edgeAgentService.reportStudy(id, dto);
  }
}
