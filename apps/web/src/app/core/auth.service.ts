import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api-config';
import { AuthUser, ROLE_HOME, SignInResponse, SijilliRole } from './auth.types';

const TOKEN_KEY = 'sijilli.access_token';
const USER_KEY = 'sijilli.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _user = signal<AuthUser | null>(this.readPersistedUser());
  readonly user = this._user.asReadonly();

  isAuthenticated(): boolean {
    return !!this.token() && !!this._user();
  }

  hasRole(...roles: readonly SijilliRole[]): boolean {
    const u = this._user();
    return !!u && roles.includes(u.role);
  }

  homeFor(role: SijilliRole): string {
    return ROLE_HOME[role] ?? '/';
  }

  token(): string | null {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const res = await firstValueFrom(
      this.http.post<SignInResponse>(`${API_BASE}/auth/sign-in`, { email, password }),
    );
    localStorage.setItem(TOKEN_KEY, res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this._user.set(res.user);
    return res.user;
  }

  signOut(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._user.set(null);
  }

  private readPersistedUser(): AuthUser | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
