// Local JWT issuer + verifier. Replaces Supabase's symmetric JWT.
// HS256 with a server-side secret (SIJILLI_JWT_SECRET).
//
// Token shape mirrors what the rest of the app expects in req.user:
//   { sub, email, sijilli_role, citizen_id?, officer_id?, region_id?,
//     municipality_id?, permissions? }
//
// Refresh tokens are opaque random strings stored alongside auth_users.
// (We don't need rotating refresh on day one — Phase 12 hardening will.)

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour

export interface SijilliJwtPayload {
  sub: string;
  email: string | null;
  sijilli_role: string;
  citizen_id?: string;
  officer_id?: string;
  region_id?: number | null;
  municipality_id?: number | null;
  permissions?: Record<string, boolean | string | number> | null;
}

@Injectable()
export class JwtService implements OnModuleInit {
  private secret!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const s = this.config.get<string>('SIJILLI_JWT_SECRET');
    if (!s || s.length < 32) {
      throw new Error(
        'SIJILLI_JWT_SECRET is required and must be at least 32 chars. Generate with: ' +
          'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"',
      );
    }
    this.secret = s;
  }

  signAccessToken(payload: SijilliJwtPayload): { token: string; expiresIn: number } {
    const token = jwt.sign(payload, this.secret, {
      algorithm: 'HS256',
      expiresIn: ACCESS_TTL_SECONDS,
    });
    return { token, expiresIn: ACCESS_TTL_SECONDS };
  }

  verifyAccessToken(token: string): SijilliJwtPayload {
    return jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as SijilliJwtPayload;
  }
}
