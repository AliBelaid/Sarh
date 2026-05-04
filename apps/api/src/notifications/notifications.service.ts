import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SmsGatewayService } from './sms-gateway.service';

export type NotificationKind = 'sms' | 'push' | 'email' | 'in_app';

export interface NotifyParams {
  recipient_citizen_id?: string | null;
  recipient_officer_id?: string | null;
  kinds: NotificationKind[];     // one row per kind
  title_ar: string;
  body_ar: string;
  payload?: Record<string, unknown>;
  // For SMS: explicit phone overrides the citizen lookup. Useful when the
  // recipient is a citizen but their phone field is empty (e.g. early
  // pilot users), and the officer typed it in by hand.
  sms_phone_override?: string | null;
}

export interface NotificationRecord {
  id: string;
  kind: NotificationKind;
  delivery_status: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly sms: SmsGatewayService,
  ) {}

  async dispatch(params: NotifyParams): Promise<NotificationRecord[]> {
    const inserted: NotificationRecord[] = [];
    for (const kind of params.kinds) {
      const row = await this.insert(kind, params, 'queued');
      inserted.push(row);

      if (kind === 'sms') {
        const result = await this.deliverSms(params, row.id);
        await this.supabase.admin
          .from('notifications')
          .update({ delivery_status: result.delivered ? 'sent' : 'failed' })
          .eq('id', row.id);
        row.delivery_status = result.delivered ? 'sent' : 'failed';
      } else if (kind === 'in_app' || kind === 'push') {
        // Realtime push: simply marking as 'sent' — Supabase Realtime
        // emits on the insert above. The mobile/web client subscribes to
        // the recipient_citizen_id row filter.
        await this.supabase.admin
          .from('notifications')
          .update({ delivery_status: 'sent' })
          .eq('id', row.id);
        row.delivery_status = 'sent';
      }
    }
    return inserted;
  }

  private async insert(
    kind: NotificationKind,
    params: NotifyParams,
    status: string,
  ): Promise<NotificationRecord> {
    const { data, error } = await this.supabase.admin
      .from('notifications')
      .insert({
        recipient_citizen_id: params.recipient_citizen_id ?? null,
        recipient_officer_id: params.recipient_officer_id ?? null,
        kind,
        title_ar: params.title_ar,
        body_ar: params.body_ar,
        payload: params.payload ?? null,
        delivery_status: status,
      })
      .select('id, kind, delivery_status')
      .single();
    if (error || !data) {
      throw new Error(`Failed to insert notification: ${error?.message ?? 'unknown'}`);
    }
    return data as NotificationRecord;
  }

  private async deliverSms(params: NotifyParams, notificationId: string) {
    let phone = params.sms_phone_override ?? null;
    if (!phone && params.recipient_citizen_id) {
      const { data } = await this.supabase.admin
        .from('citizens')
        .select('phone')
        .eq('id', params.recipient_citizen_id)
        .maybeSingle();
      phone = (data?.phone as string | null) ?? null;
    }
    if (!phone) {
      this.logger.warn(`SMS notification ${notificationId} has no recipient phone — skipped`);
      return { delivered: false, error: 'no_phone' };
    }
    return this.sms.send({
      to: phone,
      body: `صرح: ${params.title_ar}\n${params.body_ar}`,
      reference: notificationId,
    });
  }
}
