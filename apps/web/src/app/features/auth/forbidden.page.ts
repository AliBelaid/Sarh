import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth.service';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="card">
      <h1>غير مصرّح</h1>
      <p>ليس لديك صلاحية الوصول إلى هذه الصفحة.</p>
      <a routerLink="/">العودة للرئيسية</a>
    </div>
  `,
  styles: [`
    .card {
      max-width: 420px; margin: 80px auto; padding: 32px 28px;
      border: 1px solid var(--rule); background: var(--paper);
      text-align: center;
    }
    h1 { font-size: 22px; color: var(--warn); margin: 0 0 8px; }
    p { color: var(--muted); }
    a { color: var(--primary); }
  `],
})
export class ForbiddenPage {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
}
