import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '@core/auth.service';

@Component({
  selector: 'app-citizen-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="display">أهلاً بك في سِجِلّي</h1>
    <p class="muted">استخدم القائمة لتسجيل عقار جديد، أو متابعة طلباتك، أو الاطلاع على بطاقتك الرقمية.</p>
  `,
  styles: [`h1 { margin: 0 0 12px; font-size: 24px; } .muted { color: var(--muted); }`],
})
export class CitizenHomePage {
  protected readonly auth = inject(AuthService);
}
