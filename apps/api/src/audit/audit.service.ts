import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'issue_id'
  | 'revoke_id'
  | 'view'
  | 'login';

export type AuditActorKind = 'officer' | 'citizen' | 'system';

export interface AuditEntry {
  actor_kind: AuditActorKind;
  actor_id?: string | null;
  action: AuditAction;
  entity_table: string;
  entity_id?: string | null;
  before_state?: unknown;
  after_state?: unknown;
  ip_address?: string | null;
  user_agent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async record(entry: AuditEntry): Promise<void> {
    const { error } = await this.supabase.admin.from('audit_log').insert({
      actor_kind: entry.actor_kind,
      actor_id: entry.actor_id ?? null,
      action: entry.action,
      entity_table: entry.entity_table,
      entity_id: entry.entity_id ?? null,
      before_state: entry.before_state ?? null,
      after_state: entry.after_state ?? null,
      ip_address: entry.ip_address ?? null,
      user_agent: entry.user_agent ?? null,
    });

    if (error) {
      // We never throw from audit — losing the request because of an audit
      // failure is worse than losing the audit row. Logged loudly so ops
      // can pick it up.
      this.logger.error(`Failed to write audit_log entry: ${error.message}`, error);
    }
  }
}
