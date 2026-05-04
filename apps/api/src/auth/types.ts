// The shape attached to req.user after DigitalIdAuthGuard runs.
// Matches the custom JWT claims injected by the Supabase Auth Hook
// (see infra/supabase/functions/auth-hook-claims/) — but if the hook is
// not deployed, the guard falls back to a DB lookup so dev still works.

export type SijilliRole =
  | 'super_admin'
  | 'registry_officer'
  | 'id_issuer'
  | 'auditor'
  | 'reviewer'
  | 'citizen';

export interface SijilliRequestUser {
  // Supabase auth user id (auth.users.id)
  sub: string;
  email?: string | null;
  role: SijilliRole;
  citizen_id?: string | null;
  officer_id?: string | null;
  permissions?: Record<string, boolean | string | number> | null;
  region_id?: number | null;
  municipality_id?: number | null;
}
