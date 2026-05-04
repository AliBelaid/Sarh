// Sijilli roles. Mirrors apps/api/src/auth/types.ts.
export type SijilliRole =
  | 'super_admin'
  | 'auditor'
  | 'registry_officer'
  | 'reviewer'
  | 'id_issuer'
  | 'citizen';

export interface AuthUser {
  id: string;
  email: string | null;
  role: SijilliRole;
  officer_id: string | null;
  citizen_id: string | null;
}

export interface SignInResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

// Where each role lands after sign-in.
export const ROLE_HOME: Record<SijilliRole, string> = {
  super_admin:      '/admin',
  auditor:          '/admin',
  registry_officer: '/officer',
  reviewer:         '/officer',
  id_issuer:        '/id-issuer',
  citizen:          '/citizen',
};
