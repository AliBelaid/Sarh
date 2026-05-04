import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { SijilliErrors } from '../../common/errors/error-envelope';
import { SijilliRequestUser, SijilliRole } from '../types';
import { JwtService } from '../jwt.service';

// Local JWT verification — no DB roundtrip needed.
// The token is signed by AuthService at sign-in with the full user
// payload, so we can attach req.user from the verified claims directly.
@Injectable()
export class DigitalIdAuthGuard implements CanActivate {
  private readonly logger = new Logger(DigitalIdAuthGuard.name);

  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: SijilliRequestUser }>();
    const token = extractBearer(req);
    if (!token) throw SijilliErrors.unauthorized();

    let claims;
    try {
      claims = this.jwt.verifyAccessToken(token);
    } catch (e) {
      this.logger.debug(`JWT verify failed: ${(e as Error).message}`);
      throw SijilliErrors.unauthorized();
    }

    if (!claims.sijilli_role) throw SijilliErrors.unauthorized();

    req.user = {
      sub: claims.sub,
      email: claims.email,
      role: claims.sijilli_role as SijilliRole,
      citizen_id: claims.citizen_id ?? null,
      officer_id: claims.officer_id ?? null,
      region_id: claims.region_id ?? null,
      municipality_id: claims.municipality_id ?? null,
      permissions: claims.permissions ?? null,
    };
    return true;
  }
}

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const [scheme, token] = h.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}
