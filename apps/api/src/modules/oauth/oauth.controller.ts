import {
  Controller, Get, Delete, Query, Param,
  ParseUUIDPipe, Res, HttpCode, HttpStatus, ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtPayload } from '@smartpacs/types';
import { Response } from 'express';


import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public, RequirePermissions } from '../../common/decorators/roles.decorator';

import { OAuthService } from './oauth.service';


const ADMIN_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'CLINIC_ADMIN'];

@ApiTags('oauth')
@Controller({ path: 'oauth', version: '1' })
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('tokens')
  @ApiBearerAuth('JWT-auth')
  @RequirePermissions('storage:read')
  @ApiOperation({ summary: 'List connected OAuth accounts' })
  listTokens(
    @CurrentUser() user: JwtPayload,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.oauthService.listTokens(user, clinicId);
  }

  // ─── Google ──────────────────────────────────────────────────

  @Get('google/authorize')
  @ApiBearerAuth('JWT-auth')
  @RequirePermissions('storage:configure')
  @ApiOperation({ summary: 'Get Google Drive OAuth URL (Admin only)' })
  getGoogleUrl(
    @CurrentUser() user: JwtPayload,
    @Query('clinicId') clinicId?: string,
    @Query('destinationId') destinationId?: string,
  ) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Apenas Super Admin e Administradores podem configurar OAuth');
    }
    const effectiveClinicId = clinicId || user.clinicId;
    const state = this.oauthService.buildState({
      tenantId: user.tenantId,
      userId: user.sub,
      clinicId: effectiveClinicId,
      destinationId,
    });
    const url = this.oauthService.getGoogleAuthUrl(state);
    return { url };
  }

  @Get('google/callback')
  @Public()
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const appUrl = this.configService.get<string>('app.url', 'http://localhost:3000');
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      await this.oauthService.handleGoogleCallback(code, state);
      const dest = stateData.destinationId ? `&destinationId=${stateData.destinationId}` : '';
      const clinic = stateData.clinicId ? `&clinicId=${stateData.clinicId}` : '';
      res.redirect(`${appUrl}/storage?oauth=google&success=true${clinic}${dest}`);
    } catch (err: any) {
      res.redirect(`${appUrl}/storage?oauth=google&error=${encodeURIComponent(err.message)}`);
    }
  }

  // ─── Microsoft ───────────────────────────────────────────────

  @Get('microsoft/authorize')
  @ApiBearerAuth('JWT-auth')
  @RequirePermissions('storage:configure')
  @ApiOperation({ summary: 'Get Microsoft OneDrive OAuth URL (Admin only)' })
  getMicrosoftUrl(
    @CurrentUser() user: JwtPayload,
    @Query('clinicId') clinicId?: string,
    @Query('destinationId') destinationId?: string,
  ) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Apenas Super Admin e Administradores podem configurar OAuth');
    }
    const effectiveClinicId = clinicId || user.clinicId;
    const state = this.oauthService.buildState({
      tenantId: user.tenantId,
      userId: user.sub,
      clinicId: effectiveClinicId,
      destinationId,
    });
    const url = this.oauthService.getMicrosoftAuthUrl(state);
    return { url };
  }

  @Get('microsoft/callback')
  @Public()
  @ApiOperation({ summary: 'Microsoft OAuth callback' })
  async microsoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const appUrl = this.configService.get<string>('app.url', 'http://localhost:3000');
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      await this.oauthService.handleMicrosoftCallback(code, state);
      const dest = stateData.destinationId ? `&destinationId=${stateData.destinationId}` : '';
      const clinic = stateData.clinicId ? `&clinicId=${stateData.clinicId}` : '';
      res.redirect(`${appUrl}/storage?oauth=microsoft&success=true${clinic}${dest}`);
    } catch (err: any) {
      res.redirect(`${appUrl}/storage?oauth=microsoft&error=${encodeURIComponent(err.message)}`);
    }
  }

  // ─── Revoke ──────────────────────────────────────────────────

  @Delete('tokens/:id')
  @ApiBearerAuth('JWT-auth')
  @RequirePermissions('storage:configure')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an OAuth token (Admin only)' })
  revokeToken(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.oauthService.revokeToken(id, user);
  }
}
