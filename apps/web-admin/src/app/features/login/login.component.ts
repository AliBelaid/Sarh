import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'sijilli-admin-login',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  private static readonly LAST_EMAIL_KEY = 'sarh.admin.lastEmail';

  email = '';
  password = '';
  busy = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    try {
      const saved = localStorage.getItem(LoginComponent.LAST_EMAIL_KEY);
      if (saved) this.email = saved;
    } catch {
      // localStorage may be blocked (e.g., private mode) — ignore.
    }
  }

  goHome() {
    void this.router.navigate(['/']);
  }

  async submit() {
    if (!this.validate()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.signIn(this.email, this.password);
      if (!this.auth.canAdmin()) {
        this.error.set('هذا الحساب لا يملك صلاحيات الإدارة.');
        await this.auth.signOut();
        return;
      }
      try {
        localStorage.setItem(LoginComponent.LAST_EMAIL_KEY, this.email);
      } catch {
        // ignore
      }
      await this.router.navigate(['/app']);
    } catch (e) {
      this.error.set(this.errorMessage(e, 'تعذّر تسجيل الدخول.'));
    } finally {
      this.busy.set(false);
    }
  }

  async enterDemo() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.signInDemo();
      await this.router.navigate(['/app/digital-ids']);
    } catch (e) {
      this.error.set(this.errorMessage(e, 'تعذّر تسجيل الدخول التجريبي.'));
    } finally {
      this.busy.set(false);
    }
  }

  private validate(): boolean {
    if (!this.email || !this.password) {
      this.error.set('يرجى إدخال البريد وكلمة المرور.');
      return false;
    }
    if (this.password.length < 6) {
      this.error.set('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      return false;
    }
    return true;
  }

  private errorMessage(e: unknown, fallback: string): string {
    const msg = (e as { message?: string }).message;
    if (!msg) return fallback;
    // Translate the most common Supabase Auth errors to Arabic.
    if (msg.toLowerCase().includes('invalid login credentials')) {
      return 'بيانات الدخول غير صحيحة.';
    }
    if (msg.toLowerCase().includes('email not confirmed')) {
      return 'يجب تأكيد البريد الإلكتروني أولاً عبر الرابط المُرسل.';
    }
    return msg;
  }
}
