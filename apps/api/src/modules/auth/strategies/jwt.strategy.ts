import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { JwtPayload } from '@smartpacs/types';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('auth.jwtSecret'),
      issuer: 'smartpacs',
      audience: 'smartpacs-api',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const session = await this.prisma.userSession.findFirst({
      where: { userId: payload.sub, isRevoked: false },
    });

    if (!session) throw new UnauthorizedException('Session revoked or expired');

    // Update last used
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => null);

    return payload;
  }
}
