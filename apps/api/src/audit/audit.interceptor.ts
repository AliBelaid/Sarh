import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditAction, AuditActorKind, AuditService } from './audit.service';
import { SijilliRequestUser } from '../auth/types';

export interface AuditMeta {
  action: AuditAction;
  entity: string;
  // entityIdFrom: tells the interceptor where to read the entity id from
  // the response body. Defaults to 'id'. For nested objects use a dotted
  // path (e.g. 'card.id').
  entityIdFrom?: string;
  // captureRequestBody: also persist the inbound request body to
  // before_state/after_state. Default true.
  captureRequestBody?: boolean;
}

const AUDIT_META_KEY = 'sijilli.audit';

// Decorator placed on controller methods to declare what should be audited.
// The interceptor only fires after the handler succeeds; failed requests
// are not written to audit_log.
export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_META_KEY, meta);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_META_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request & { user?: SijilliRequestUser }>();
    const inboundBody = req.body;

    return next.handle().pipe(
      tap((response) => {
        const actor = this.actorFor(req.user);
        const entityId = pickEntityId(response, meta.entityIdFrom ?? 'id');

        // Fire-and-forget; audit failures are logged but never escalated.
        void this.audit.record({
          actor_kind: actor.kind,
          actor_id: actor.id,
          action: meta.action,
          entity_table: meta.entity,
          entity_id: entityId,
          before_state: meta.captureRequestBody === false ? null : inboundBody,
          after_state: response,
          ip_address: requestIp(req),
          user_agent: req.headers['user-agent'] ?? null,
        });
      }),
    );
  }

  private actorFor(user?: SijilliRequestUser): { kind: AuditActorKind; id: string | null } {
    if (!user) return { kind: 'system', id: null };
    if (user.officer_id) return { kind: 'officer', id: user.officer_id };
    if (user.citizen_id) return { kind: 'citizen', id: user.citizen_id };
    return { kind: 'system', id: user.sub ?? null };
  }
}

function pickEntityId(payload: unknown, path: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const parts = path.split('.');
  let cursor: unknown = payload;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === 'string' ? cursor : null;
}

function requestIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}
