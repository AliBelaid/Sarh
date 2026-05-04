import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'sijilli-issuer-login',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  busy = signal(false);
  error = signal<string | null>(null);

  async submit() {
    if (!this.email || !this.password) {
      this.error.set('يرجى إدخال البريد وكلمة المرور.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.signIn(this.email, this.password);
      if (!this.auth.canIssue()) {
        this.error.set('هذا الحساب لا يملك صلاحية إصدار البطاقات.');
        await this.auth.signOut();
        return;
      }
      await this.router.navigate(['/']);
    } catch (e) {
      this.error.set((e as { message?: string }).message ?? 'تعذّر تسجيل الدخول.');
    } finally {
      this.busy.set(false);
    }
  }
}
