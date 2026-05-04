import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import type { SijilliRole } from '@sijilli/shared-types';
import { SupabaseService } from './supabase.service';

export interface IssuerProfile {
  user: User;
  role: SijilliRole;
  officer_id: string | null;
  region_id: number | null;
  region_code: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService);
  private sessionSig = signal<Session | null>(null);
  private profileSig = signal<IssuerProfile | null>(null);
  private initializingSig = signal(true);

  readonly session = this.sessionSig.asReadonly();
  readonly profile = this.profileSig.asReadonly();
  readonly initializing = this.initializingSig.asReadonly();
  readonly isAuthenticated = computed(() => this.profileSig() !== null);
  // The station is locked to the id_issuer role per CLAUDE.md permission map.
  readonly canIssue = computed(() => {
    const r = this.profileSig()?.role;
    return r === 'id_issuer' || r === 'super_admin';
  });

  constructor() {
    void this.bootstrap();
    this.supabase.client.auth.onAuthStateChange((_evt, session) => {
      this.sessionSig.set(session);
      this.profileSig.set(session ? this.profileFromSession(session) : null);
    });
  }

  private async bootstrap() {
    const { data } = await this.supabase.client.auth.getSession();
    this.sessionSig.set(data.session ?? null);
    this.profileSig.set(data.session ? this.profileFromSession(data.session) : null);
    this.initializingSig.set(false);
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    this.sessionSig.set(data.session);
    this.profileSig.set(data.session ? this.profileFromSession(data.session) : null);
  }

  async signOut() {
    await this.supabase.client.auth.signOut();
    this.sessionSig.set(null);
    this.profileSig.set(null);
  }

  accessToken(): string | null {
    return this.sessionSig()?.access_token ?? null;
  }

  private profileFromSession(s: Session): IssuerProfile {
    const meta = (s.user.app_metadata ?? {}) as Record<string, unknown>;
    return {
      user: s.user,
      role: (meta['sijilli_role'] as SijilliRole) ?? 'id_issuer',
      officer_id: (meta['officer_id'] as string) ?? null,
      region_id: (meta['region_id'] as number) ?? null,
      region_code: (meta['region_code'] as string) ?? null,
    };
  }
}
