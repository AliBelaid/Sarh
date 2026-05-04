import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-verify-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="page">
      <h1 class="display">التحقق من سند عقاري</h1>
      <p class="muted">أدخل رمز السند الموجود على PDF أو امسح رمز QR.</p>
      <form (ngSubmit)="go()">
        <input [(ngModel)]="code" name="code" placeholder="LY-11-2026-000123" dir="ltr" />
        <button type="submit">تحقق</button>
      </form>
    </div>
  `,
  styles: [`
    .page { max-width: 520px; margin: 60px auto; padding: 0 20px; }
    h1 { font-size: 24px; margin: 0 0 12px; }
    .muted { color: var(--muted); margin-bottom: 18px; }
    form { display: flex; gap: 8px; }
    input { flex: 1; padding: 10px 12px; border: 1px solid var(--rule); }
    button { padding: 10px 18px; background: var(--primary); color: var(--accent); border: 0; cursor: pointer; }
  `],
})
export class VerifyHomePage {
  private readonly router = inject(Router);
  code = '';

  go(): void {
    const c = this.code.trim();
    if (c) this.router.navigate(['/verify', c]);
  }
}
