import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '@smartpacs/types';
import { Request } from 'express';

export interface ViewerAccess {
  studyInstanceUid: string;
  tenantId: string;
}

/**
 * Authorizes requests to the DICOMweb proxy two ways:
 *  - a normal user JWT in the Authorization header (sets req.user), or
 *  - a short-lived, single-study viewer token in the ?token= query param
 *    (sets req.viewerAccess) -- needed because OHIF's own fetch calls to its
 *    DICOMweb data source cannot be configured to send a custom Authorization
 *    header out of the box.
 */
@Injectable()
export class DicomwebAccessGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & {
      user?: JwtPayload;
      viewerAccess?: ViewerAccess;
    }>();

    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const viewerToken = request.query.token as string | undefined;

    if (bearerToken) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload & { type?: string }>(bearerToken, {
          secret: this.configService.get<string>('auth.jwtSecret'),
          issuer: 'smartpacs',
          audience: 'smartpacs-api',
        });
        if (payload.type !== 'viewer') {
          request.user = payload;
          return true;
        }
      } catch {
        // fall through to viewer token check
      }
    }

    if (viewerToken) {
      try {
        const payload = await this.jwtService.verifyAsync<{ sub: string; tenantId: string; type: string }>(
          viewerToken,
          {
            secret: this.configService.get<string>('auth.jwtSecret'),
            issuer: 'smartpacs',
            audience: 'smartpacs-api',
          },
        );
        if (payload.type === 'viewer') {
          request.viewerAccess = { studyInstanceUid: payload.sub, tenantId: payload.tenantId };
          return true;
        }
      } catch {
        // falls through to the final rejection below
      }
    }

    throw new UnauthorizedException('Missing or invalid credentials');
  }
}
