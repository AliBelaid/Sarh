import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'sarh-admin-landing',
  standalone: true,
  imports: [RouterLink, MatSnackBarModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  signedIn = this.auth.isAuthenticated;
  busy = signal(false);

  openDashboard() {
    void this.router.navigate(['/app']);
  }

  goLogin() {
    void this.router.navigate(['/login']);
  }

  async enterDemo() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.signInDemo();
      await this.router.navigate(['/app/digital-ids']);
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'تعذّر تسجيل الدخول التجريبي.';
      this.snack.open(msg, 'إغلاق', { duration: 5000 });
    } finally {
      this.busy.set(false);
    }
  }
}
