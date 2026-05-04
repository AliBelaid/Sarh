import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SijilliErrors } from '../../common/errors/error-envelope';
import { SijilliRequestUser, SijilliRole } from '../types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<SijilliRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: SijilliRequestUser }>();
    if (!req.user) throw SijilliErrors.unauthorized();
    if (!required.includes(req.user.role)) throw SijilliErrors.forbidden();
    return true;
  }
}
