import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SijilliRequestUser } from '../types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SijilliRequestUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: SijilliRequestUser }>();
    if (!req.user) {
      throw new Error('CurrentUser used without DigitalIdAuthGuard');
    }
    return req.user;
  },
);
