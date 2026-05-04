// Supabase Auth Hook — Custom Access Token claims.
//
// Configure in Supabase dashboard:
//   Authentication → Hooks → Custom Access Token
//   Hook URL: https://<project>.supabase.co/functions/v1/auth-hook-claims
//
// The hook is invoked every time Supabase mints a JWT (sign-in, refresh).
// It receives { user_id, claims } and must return the (possibly modified)
// claims. We merge in Sijilli-specific fields by calling the SQL helper
// `sijilli_auth_claims(auth_user_id)`.
//
// Local dev: `supabase functions serve auth-hook-claims --no-verify-jwt`

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface AuthHookPayload {
  user_id: string;
  claims: Record<string, unknown>;
  authentication_method?: string;
}

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let payload: AuthHookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid payload' }, 400);
  }

  const { user_id, claims } = payload;
  if (!user_id) return jsonResponse({ error: 'missing user_id' }, 400);

  const { data, error } = await admin.rpc('sijilli_auth_claims', {
    p_auth_user_id: user_id,
  });

  if (error) {
    console.error('sijilli_auth_claims failed', error);
    // Fail open: return original claims rather than blocking sign-in.
    return jsonResponse({ claims });
  }

  const merged = {
    ...claims,
    ...((data as Record<string, unknown> | null) ?? {}),
  };

  return jsonResponse({ claims: merged });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
