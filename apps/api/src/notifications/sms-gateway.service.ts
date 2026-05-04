// SMS gateway abstraction.
//
// LibyanaSmsGateway is the production implementation — talks HTTP(S) to
// the Libyana SMS HTTP API using the credentials from env. The endpoint
// surface differs between MVNO contracts; treat this as a placeholder
// that will be tuned during integration.
//
// In dev (no SMS_GATEWAY_URL set), the no-op implementation just logs.
// Either way, the persisted notification row is updated with
// delivery_status = 'sent' | 'failed' so the UI can show what happened.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsMessage {
  to: string;        // E.164, e.g. +21891xxxxxxx
  body: string;      // Arabic body (UTF-8)
  reference?: string; // optional dedup key
}

export interface SmsResult {
  delivered: boolean;
  provider_message_id?: string;
  error?: string;
}

@Injectable()
export class SmsGatewayService {
  private readonly logger = new Logger(SmsGatewayService.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: SmsMessage): Promise<SmsResult> {
    const url = this.config.get<string>('SMS_GATEWAY_URL');
    if (!url) {
      this.logger.warn(
        `[dev] SMS_GATEWAY_URL not set — would have sent SMS to ${maskPhone(message.to)}: "${message.body}"`,
      );
      return { delivered: true, provider_message_id: 'dev-no-op' };
    }

    const user = this.config.get<string>('SMS_GATEWAY_USER') ?? '';
    const pass = this.config.get<string>('SMS_GATEWAY_PASS') ?? '';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
        },
        body: JSON.stringify({
          to: message.to,
          text: message.body,
          reference: message.reference,
          source: 'Sijilli',
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return { delivered: false, error: `HTTP ${res.status}: ${detail.slice(0, 200)}` };
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
      return { delivered: true, provider_message_id: json.id ?? json.messageId };
    } catch (err) {
      return { delivered: false, error: (err as Error).message };
    }
  }
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return '***';
  return phone.slice(0, 4) + '****' + phone.slice(-2);
}
