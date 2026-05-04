import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import type { SijilliRole } from '@sijilli/shared-types';
import { SupabaseService } from './supabase.service';

export interface OfficerProfile {
  user: User;
  role: SijilliRole;
  officer_id: string | null;
  region_id: number | null;
  permissions: Record<string, boolean | string | number> | null;
}

// Reads the custom claims set by infra/supabase/functions/auth-hook-claims/.
// If the hook isn't deployed, role/officer_id are null and the API will
// fall back to a DB lookup on every request — works but slower.
@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService);
  private sessionSig = signal<Session | null>(null);
  private profileSig = signal<OfficerProfile | null>(null);
  private initializingSig = signal(true);

  readonly session = this.sessionSig.asReadonly();
  readonly profile = this.profileSig.asReadonly();
  readonly initializing = this.initializingSig.asReadonly();
  readonly isAuthenticated = computed(() => this.profileSig() !== null);

  constructor() {
    void this.bootstrap();
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.sessionSig.set(session);
      this.profileSig.set(session ? this.profileFromSession(session) : null);
    });
  }

  private async bootstrap(): Promise<void> {
    const { data } = await this.supabase.client.auth.getSession();
    this.sessionSig.set(data.session ?? null);
    this.profileSig.set(data.session ? this.profileFromSession(data.session) : null);
    this.initializingSig.set(false);
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    this.sessionSig.set(data.session);
    this.profileSig.set(data.session ? this.profileFromSession(data.session) : null);
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this.sessionSig.set(null);
    this.profileSig.set(null);
  }

  accessToken(): string | null {
    return this.sessionSig()?.access_token ?? null;
  }

  private profileFromSession(session: Session): OfficerProfile {
    const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>;
    const role = (meta['sijilli_role'] as SijilliRole) ?? 'registry_officer';
    return {
      user: session.user,
      role,
      officer_id: (meta['officer_id'] as string) ?? null,
      region_id: (meta['region_id'] as number) ?? null,
      permissions:
        (meta['permissions'] as Record<string, boolean | string | number>) ?? null,
    };
  }
}
