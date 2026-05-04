import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import type { SijilliRole } from '@sijilli/shared-types';
import { SupabaseService } from './supabase.service';

export interface AdminProfile {
  user: Session['user'];
  role: SijilliRole;
  officer_id: string | null;
}

// Shared "real demo" credentials. Click "دخول تجريبي" → we signUp on
// first use and signIn on subsequent visits so the demo session is a
// real Supabase user (not a synthetic bypass). Means the admin lists
// query the real DB and surface real data — empty state on a fresh
// project, populated once seed migrations or live issuance fill it in.
const DEMO_EMAIL = 'demo@sarh.ly';
const DEMO_PASSWORD = 'Sarh!Demo2026';

// Stale demo-bypass flag from earlier offline-only mode — remove if we
// see it on bootstrap so the user isn't stuck in mock-data mode.
const LEGACY_DEMO_FLAG = 'sijilli.admin.demo';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService);
  private sessionSig = signal<Session | null>(null);
  private profileSig = signal<AdminProfile | null>(null);
  private initializingSig = signal(true);

  readonly session = this.sessionSig.asReadonly();
  readonly profile = this.profileSig.asReadonly();
  readonly initializing = this.initializingSig.asReadonly();
  readonly isAuthenticated = computed(() => this.profileSig() !== null);
  // No more mock bypass — demo button signs into a real Supabase user, so
  // the rest of the app always queries real data.
  readonly isDemo = signal(false).asReadonly();
  readonly canAdmin = computed(() => {
    const r = this.profileSig()?.role;
    return r === 'super_admin' || r === 'auditor';
  });

  constructor() {
    try { localStorage.removeItem(LEGACY_DEMO_FLAG); } catch { /* ignore */ }
    void this.bootstrap();
    this.supabase.client.auth.onAuthStateChange((_e, session) => {
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

  // Sign into the demo Supabase account. Tries signIn first; on
  // "Invalid login credentials" we fall back to signUp (first run) and
  // then signIn again. Throws if Supabase is unreachable so the UI can
  // surface a meaningful error.
  async signInDemo(): Promise<void> {
    try {
      await this.signIn(DEMO_EMAIL, DEMO_PASSWORD);
      return;
    } catch (e) {
      const msg = (e as { message?: string }).message?.toLowerCase() ?? '';
      const looksLikeMissingUser =
        msg.includes('invalid login credentials') || msg.includes('user not found');
      if (!looksLikeMissingUser) throw e;
    }
    // First-run path: create the demo account, then sign in. If the
    // project has email confirmation enabled signUp returns no session
    // and the following signIn will throw "Email not confirmed" — we
    // catch and rewrap with an actionable Arabic message.
    const { data: signUp, error: signUpErr } =
      await this.supabase.client.auth.signUp({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
    if (signUpErr) throw signUpErr;
    if (signUp.session) {
      this.sessionSig.set(signUp.session);
      this.profileSig.set(this.profileFromSession(signUp.session));
      return;
    }
    try {
      await this.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    } catch (e) {
      const msg = (e as { message?: string }).message?.toLowerCase() ?? '';
      if (msg.includes('email not confirmed')) {
        throw new Error(
          'تمّ إنشاء الحساب التجريبي لكن المشروع يطلب تأكيد البريد. ' +
            'افتح Supabase → Authentication → Providers → Email وعطّل ' +
            '"Confirm email"، ثم حاول مجدّداً.',
        );
      }
      throw e;
    }
  }

  async signOut() {
    await this.supabase.client.auth.signOut();
    this.sessionSig.set(null);
    this.profileSig.set(null);
  }

  accessToken(): string | null {
    return this.sessionSig()?.access_token ?? null;
  }

  private profileFromSession(s: Session): AdminProfile {
    const meta = (s.user.app_metadata ?? {}) as Record<string, unknown>;
    return {
      user: s.user,
      role: (meta['sijilli_role'] as SijilliRole) ?? 'super_admin',
      officer_id: (meta['officer_id'] as string) ?? null,
    };
  }
}
