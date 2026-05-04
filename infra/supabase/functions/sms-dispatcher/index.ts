// Supabase Edge Function — SMS dispatcher.
//
// Two ways this function is invoked:
//
// 1. Webhook from a Postgres trigger (recommended for production): a
//    DB trigger on INSERT to `notifications WHERE kind='sms'` calls
//    pg_net.http_post() with the row id. Set up with:
//
//    CREATE EXTENSION IF NOT EXISTS pg_net;
//    -- (see supabase docs for the trigger function template)
//
// 2. Direct HTTP call from the API (current Phase 5 wiring) — useful in
//    dev because it doesn't require pg_net to be enabled.
//
// Both modes accept POST { notification_id: uuid } and resolve the row,
// then call the Libyana HTTP gateway.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const smsUrl = Deno.env.get('SMS_GATEWAY_URL') ?? '';
const smsUser = Deno.env.get('SMS_GATEWAY_USER') ?? '';
const smsPass = Deno.env.get('SMS_GATEWAY_PASS') ?? '';

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface DispatcherPayload {
  notification_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return text('method not allowed', 405);

  let payload: DispatcherPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid payload' }, 400);
  }
  if (!payload.notification_id) return json({ error: 'missing notification_id' }, 400);

  // Load the notification + recipient phone in one go.
  const { data, error } = await admin
    .from('notifications')
    .select('id, kind, recipient_citizen_id, body_ar, title_ar, delivery_status, citizens:recipient_citizen_id ( phone )')
    .eq('id', payload.notification_id)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: 'notification not found' }, 404);
  if (data.kind !== 'sms') return json({ error: 'not an sms notification' }, 400);
  if (data.delivery_status === 'sent') return json({ ok: true, already: true });

  const phone =
    (data as any).citizens?.phone ??
    null;
  if (!phone) {
    await admin
      .from('notifications')
      .update({ delivery_status: 'failed' })
      .eq('id', data.id);
    return json({ ok: false, error: 'no_phone' }, 200);
  }

  if (!smsUrl) {
    console.warn('SMS_GATEWAY_URL not configured — dev no-op');
    await admin.from('notifications').update({ delivery_status: 'sent' }).eq('id', data.id);
    return json({ ok: true, dev: true });
  }

  try {
    const res = await fetch(smsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${smsUser}:${smsPass}`)}`,
      },
      body: JSON.stringify({
        to: phone,
        text: `صرح: ${data.title_ar}\n${data.body_ar}`,
        reference: data.id,
        source: 'Sarh',
      }),
    });
    const ok = res.ok;
    await admin
      .from('notifications')
      .update({ delivery_status: ok ? 'sent' : 'failed' })
      .eq('id', data.id);
    return json({ ok, status: res.status });
  } catch (err) {
    await admin.from('notifications').update({ delivery_status: 'failed' }).eq('id', data.id);
    return json({ ok: false, error: (err as Error).message }, 502);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function text(body: string, status = 200): Response {
  return new Response(body, { status });
}
