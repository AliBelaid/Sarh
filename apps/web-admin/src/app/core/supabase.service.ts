import { Injectable } from '@angular/core';
import {
  createClient,
  RealtimeChannel,
  SupabaseClient,
} from '@supabase/supabase-js';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;
  constructor() {
    this.client = createClient(environment.supabase.url, environment.supabase.anonKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    });
  }

  // Live stream of `select` results. Emits the current rows, then re-emits
  // whenever Postgres realtime fires INSERT/UPDATE/DELETE for that table.
  // We re-query on every event rather than diffing the payload locally so
  // the embedded `citizen:citizens(...)` join stays consistent.
  liveQuery<T>(opts: {
    table: string;
    select?: string;
    order?: { column: string; ascending?: boolean };
    limit?: number;
    filter?: { column: string; value: string | number };
  }): Observable<T[]> {
    return new Observable<T[]>((sub) => {
      let cancelled = false;
      let channel: RealtimeChannel | null = null;

      const fetch = async () => {
        let q = this.client.from(opts.table).select(opts.select ?? '*');
        if (opts.filter) q = q.eq(opts.filter.column, opts.filter.value);
        if (opts.order) {
          q = q.order(opts.order.column, { ascending: opts.order.ascending ?? false });
        }
        if (opts.limit) q = q.limit(opts.limit);
        const { data, error } = await q;
        if (cancelled) return;
        if (error) sub.error(error);
        else sub.next((data ?? []) as T[]);
      };

      void fetch();

      channel = this.client
        .channel(`live:${opts.table}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: opts.table },
          () => void fetch(),
        )
        .subscribe();

      return () => {
        cancelled = true;
        if (channel) void this.client.removeChannel(channel);
      };
    });
  }
}
