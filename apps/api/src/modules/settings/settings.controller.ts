import * as fs from 'fs';
import * as path from 'path';

import {
  Controller, Get, Patch, Body, ForbiddenException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JwtPayload } from '@smartpacs/types';
import { IsString, IsOptional } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

class UpdateEnvDto {
  @ApiPropertyOptional() @IsOptional() @IsString() GOOGLE_CLIENT_ID?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() GOOGLE_CLIENT_SECRET?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() GOOGLE_REDIRECT_URI?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() MICROSOFT_CLIENT_ID?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() MICROSOFT_CLIENT_SECRET?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() MICROSOFT_TENANT_ID?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() MICROSOFT_REDIRECT_URI?: string;
}

const OAUTH_KEYS = [
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',
  'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET',
  'MICROSOFT_TENANT_ID', 'MICROSOFT_REDIRECT_URI',
];

@ApiTags('settings')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly auditService: AuditService) {}
  private getEnvPath(): string {
    // Walk up to find the root .env file
    let dir = process.cwd();
    for (let i = 0; i < 5; i++) {
      const p = path.join(dir, '.env');
      if (fs.existsSync(p)) return p;
      dir = path.dirname(dir);
    }
    throw new Error('.env file not found');
  }

  private readEnv(): Record<string, string> {
    const envPath = this.getEnvPath();
    const content = fs.readFileSync(envPath, 'utf8');
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      result[key] = value;
    }
    return result;
  }

  private writeEnvKey(key: string, value: string): void {
    const envPath = this.getEnvPath();
    let content = fs.readFileSync(envPath, 'utf8');
    const regex = new RegExp(`^(${key}=).*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `$1${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
  }

  @Get('oauth-credentials')
  @ApiOperation({ summary: 'Get current OAuth credentials (Super Admin only)' })
  getOAuthCredentials(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'SUPER_ADMIN') throw new ForbiddenException('Super Admin only');
    const env = this.readEnv();
    const mask = (v: string) => {
      if (!v || v.startsWith('your-')) return '';
      if (v.length <= 8) return '****';
      return v.substring(0, 4) + '*'.repeat(Math.min(v.length - 4, 20));
    };
    return {
      GOOGLE_CLIENT_ID: mask(env.GOOGLE_CLIENT_ID || ''),
      GOOGLE_CLIENT_SECRET: mask(env.GOOGLE_CLIENT_SECRET || ''),
      GOOGLE_REDIRECT_URI: env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/v1/oauth/google/callback',
      MICROSOFT_CLIENT_ID: mask(env.MICROSOFT_CLIENT_ID || ''),
      MICROSOFT_CLIENT_SECRET: mask(env.MICROSOFT_CLIENT_SECRET || ''),
      MICROSOFT_TENANT_ID: env.MICROSOFT_TENANT_ID || 'common',
      MICROSOFT_REDIRECT_URI: env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/v1/oauth/microsoft/callback',
      configured: {
        google: !!(env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_ID.startsWith('your-')),
        microsoft: !!(env.MICROSOFT_CLIENT_ID && !env.MICROSOFT_CLIENT_ID.startsWith('your-')),
      },
    };
  }

  @Patch('oauth-credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update OAuth credentials in .env (Super Admin only, requires restart)' })
  async updateOAuthCredentials(@Body() dto: UpdateEnvDto, @CurrentUser() user: JwtPayload) {
    if (user.role !== 'SUPER_ADMIN') throw new ForbiddenException('Super Admin only');
    const updates = Object.entries(dto).filter(([k, v]) => OAUTH_KEYS.includes(k) && v && v.trim());
    for (const [key, value] of updates) {
      this.writeEnvKey(key, value!.trim());
      process.env[key] = value!.trim();
    }

    // Audit log — mask secret values
    const auditValues = Object.fromEntries(
      updates.map(([k, v]) => [
        k,
        k.includes('SECRET') || k.includes('KEY')
          ? `${v!.substring(0, 4)}****`
          : v,
      ]),
    );
    await this.auditService.log({
      tenantId: user.tenantId,
      userId: user.sub,
      action: 'STORAGE_CONFIGURED',
      entityType: 'EnvCredentials',
      newValues: auditValues,
      metadata: { updatedKeys: updates.map(([k]) => k) },
      success: true,
    });

    return {
      updated: updates.map(([k]) => k),
      message: 'Credenciais salvas. Reinicie o servidor para garantir que todas as alterações sejam carregadas.',
    };
  }
}
