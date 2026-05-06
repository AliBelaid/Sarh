// Sarh roles. Mirrors apps/api/src/auth/types.ts.
export type SarhRole =
  | 'super_admin'
  | 'auditor'
  | 'registry_officer'
  | 'reviewer'
  | 'id_issuer'
  | 'department_manager'
  | 'citizen';

export interface AuthUser {
  id: string;
  email: string | null;
  role: SarhRole;
  officer_id: string | null;
  citizen_id: string | null;
}

export interface SignInResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

// Single unified shell — every role lands on /app/dashboard, which
// renders role-specific tiles. Per-feature role gates live on the routes.
export const ROLE_HOME: Record<SarhRole, string> = {
  super_admin:        '/app/dashboard',
  auditor:            '/app/dashboard',
  registry_officer:   '/app/dashboard',
  reviewer:           '/app/dashboard',
  id_issuer:          '/app/dashboard',
  department_manager: '/app/dashboard',
  citizen:            '/app/dashboard',
};
