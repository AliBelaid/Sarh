import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, from, map, of, switchMap } from 'rxjs';
import type { Property } from '@sijilli/shared-types';

import { ApiService } from '../../core/api.service';
import { SijilliApiError } from '../../core/api.interceptor';
import { SupabaseService } from '../../core/supabase.service';
import { PropertiesActions } from './properties.actions';

// API-first with Supabase fallback. The web-officer was originally wired
// to talk to the NestJS API exclusively, but the demo can run before
// the API is on the VPS — the fallback keeps the queue usable directly
// against Supabase. Once the API is deployed, the API path is preferred
// because it enforces officer-region scoping at the app layer (which
// the permissive demo RLS does not).

type ReviewDecision = 'approve' | 'reject' | 'needs_clarification';

@Injectable()
export class PropertiesEffects {
  private actions$ = inject(Actions);
  private api = inject(ApiService);
  private supabase = inject(SupabaseService);

  load$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PropertiesActions.load),
      switchMap(({ status, regionId }) =>
        this.api.listProperties({ status, regionId, limit: 50 }).pipe(
          map((res) => PropertiesActions.loadSuccess({ items: res.items })),
          catchError(() =>
            // API unreachable — fall back to a direct Supabase query.
            from(this.loadFromSupabase(status, regionId)).pipe(
              map((items) => PropertiesActions.loadSuccess({ items })),
              catchError((err: unknown) =>
                of(
                  PropertiesActions.loadFailure({
                    messageAr:
                      (err as { message?: string })?.message ??
                      'تعذّر تحميل قائمة العقارات.',
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  review$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PropertiesActions.review),
      switchMap(({ id, decision, note, approvalDecreeNo }) =>
        this.api
          .review(id, {
            decision,
            note,
            approval_decree_no: approvalDecreeNo,
          })
          .pipe(
            map((res) =>
              PropertiesActions.reviewSuccess({
                id,
                status: res.property.status,
              }),
            ),
            catchError(() =>
              from(this.reviewInSupabase(id, decision, note, approvalDecreeNo)).pipe(
                map((status) => PropertiesActions.reviewSuccess({ id, status })),
                catchError((err: unknown) =>
                  of(
                    PropertiesActions.reviewFailure({
                      id,
                      messageAr:
                        err instanceof SijilliApiError
                          ? err.messageAr
                          : (err as { message?: string })?.message ??
                            'تعذّر تنفيذ القرار.',
                    }),
                  ),
                ),
              ),
            ),
          ),
      ),
    ),
  );

  // -- Supabase fallbacks ------------------------------------------------
  private async loadFromSupabase(
    status: string | undefined,
    regionId: number | undefined,
  ): Promise<Property[]> {
    let q = this.supabase.client
      .from('properties')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(50);
    if (status) q = q.eq('status', status);
    if (regionId != null) q = q.eq('region_id', regionId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as Property[];
  }

  private async reviewInSupabase(
    id: string,
    decision: ReviewDecision,
    note: string | undefined,
    approvalDecreeNo: string | undefined,
  ): Promise<string> {
    const now = new Date().toISOString();
    const statusByDecision: Record<ReviewDecision, string> = {
      approve: 'approved',
      reject: 'rejected',
      needs_clarification: 'needs_clarification',
    };
    const newStatus = statusByDecision[decision];
    const update: Record<string, unknown> = {
      status: newStatus,
      reviewed_at: now,
      updated_at: now,
    };
    if (decision === 'reject' || decision === 'needs_clarification') {
      update['rejection_reason'] = note ?? null;
    }
    if (decision === 'approve') {
      update['rejection_reason'] = null;
      if (approvalDecreeNo) update['approval_decree_no'] = approvalDecreeNo;
    }

    const { data: updated, error } = await this.supabase.client
      .from('properties')
      .update(update)
      .eq('id', id)
      .select('status, owner_citizen_id, property_code, parcel_number')
      .single();
    if (error) throw error;

    const ownerId = (updated as { owner_citizen_id?: string })?.owner_citizen_id;
    if (ownerId) {
      const titles: Record<ReviewDecision, string> = {
        approve: 'تم اعتماد طلبك العقاري',
        reject: 'تم رفض طلبك العقاري',
        needs_clarification: 'مطلوب توضيح على طلبك العقاري',
      };
      await this.supabase.client.from('notifications').insert({
        recipient_citizen_id: ownerId,
        kind: 'in_app',
        title_ar: titles[decision],
        body_ar:
          decision === 'approve'
            ? `تم اعتماد العقار ${(updated as { property_code?: string }).property_code ?? ''}.`
            : (note ?? 'يرجى مراجعة تفاصيل الطلب.'),
        payload: { related_table: 'properties', related_id: id, decision },
      });
    }

    const auditAction =
      decision === 'approve' ? 'approve' : decision === 'reject' ? 'reject' : 'update';
    await this.supabase.client.from('audit_log').insert({
      actor_kind: 'officer',
      action: auditAction,
      entity_table: 'properties',
      entity_id: id,
      after_state: { status: newStatus, note: note ?? null },
    });

    return newStatus;
  }
}
