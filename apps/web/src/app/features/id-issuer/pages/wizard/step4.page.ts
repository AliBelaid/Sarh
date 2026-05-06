import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { IdIssuerWizardService } from '../../wizard.service';

@Component({
  selector: 'app-id-issuer-step4',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="page">
      <header class="head">
        <h1 class="display">إصدار جديد</h1>
        <p class="sub">إذا توفّر قارئ بصمات على المحطّة، اضغط "التقاط". وإلا تجاوز هذه الخطوة.</p>
      </header>

      <ol class="stepper">
        @for (s of steps; track s.n) {
          <li [class.on]="s.n === 4" [class.done]="s.n < 4">
            <span class="num">{{ s.n }}</span>
            <span class="lbl">{{ s.label }}</span>
          </li>
        }
      </ol>

      <div class="card">
        <div class="card-head">
          <h2>٤ / ٥ — البصمة (اختياري)</h2>
          <p>تساعد البصمة في التحقّق من الهويّة لاحقاً. يمكن تجاوزها وإضافتها في زيارة قادمة.</p>
        </div>

        <div class="content">
          <div class="finger-art" [class.captured]="wizard.fingerprintCaptured()">
            <svg viewBox="0 0 24 24" width="84" height="84" fill="none" stroke="currentColor" stroke-width="1.4">
              <path d="M12 11c0-1.66 1.34-3 3-3s3 1.34 3 3v2c0 3-2 5-3 6"/>
              <path d="M9 11c0-3 2-5 5-5s5 2 5 5"/>
              <path d="M6 13c0-4 3-7 7-7s7 3 7 7"/>
              <path d="M12 11v3c0 2-1 3-2 4"/>
              <path d="M15 13c0 3-1 5-3 7"/>
            </svg>
          </div>
          <p class="state">
            @if (wizard.fingerprintCaptured()) {
              <span class="ok">✓ تم التقاط البصمة</span>
            } @else {
              <span>لم يتم الالتقاط بعد</span>
            }
          </p>
        </div>

        <div class="actions">
          <button type="button" class="btn-back" (click)="back()">→ السابق</button>
          <button type="button" class="btn-secondary" (click)="skip()">تجاوز</button>
          <button type="button" class="btn-primary" (click)="capture()">التقاط</button>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    .head { margin-bottom: 18px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }

    .stepper { list-style: none; padding: 0; margin: 0 0 18px; display: flex; gap: 4px; flex-wrap: wrap; }
    .stepper li { flex: 1; min-width: 120px; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); border-radius: 8px; font-size: 12px; color: var(--muted); }
    .stepper li.on { border-color: var(--primary); color: var(--ink); }
    .stepper li.on .num { background: var(--primary); color: var(--accent); }
    .stepper li.done { background: rgba(8, 145, 178, 0.05); border-color: rgba(8, 145, 178, 0.4); }
    .stepper li.done .num { background: var(--good); color: #fff; }
    .num { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: var(--rule); color: var(--muted); font-weight: 700; font-size: 11px; flex-shrink: 0; }
    .lbl { font-weight: 600; }

    .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 22px; }
    .card-head { margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--rule); }
    .card-head h2 { margin: 0 0 4px; font-size: 16px; color: var(--ink); }
    .card-head p  { margin: 0; font-size: 12.5px; color: var(--muted); }

    .content { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 28px 0; }
    .finger-art {
      width: 120px; height: 120px;
      border-radius: 50%;
      display: grid; place-items: center;
      background: rgba(249, 115, 22, 0.08);
      border: 1px dashed rgba(249, 115, 22, 0.4);
      color: var(--accent);
      transition: all .25s;
    }
    .finger-art.captured {
      background: rgba(8, 145, 178, 0.08);
      border-color: rgba(8, 145, 178, 0.5);
      color: var(--good);
    }
    .state { font-size: 13px; color: var(--muted); margin: 0; }
    .state .ok { color: var(--good); font-weight: 700; }

    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--rule); flex-wrap: wrap; }
    .btn-primary, .btn-secondary, .btn-back {
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 700;
      font-family: inherit; cursor: pointer; transition: all .12s; border: 1px solid;
    }
    .btn-primary { background: var(--primary); color: var(--accent); border-color: var(--primary); }
    .btn-primary:hover { background: var(--accent); color: var(--primary); }
    .btn-secondary { background: #fff; color: var(--ink); border-color: var(--rule); }
    .btn-secondary:hover { border-color: var(--accent); }
    .btn-back { background: transparent; color: var(--muted); border-color: transparent; margin-inline-end: auto; }
    .btn-back:hover { color: var(--ink); }
  `],
})
export class IdIssuerStep4Page {
  private readonly router = inject(Router);
  protected readonly wizard = inject(IdIssuerWizardService);

  readonly steps = [
    { n: 1, label: 'الهوية' },
    { n: 2, label: 'الصورة' },
    { n: 3, label: 'التوقيع' },
    { n: 4, label: 'البصمة' },
    { n: 5, label: 'المراجعة' },
  ];

  back(): void { void this.router.navigate(['/app/issue/produce/step3']); }

  capture(): void {
    this.wizard.fingerprintCaptured.set(true);
    void this.router.navigate(['/app/issue/produce/step5']);
  }

  skip(): void {
    this.wizard.fingerprintCaptured.set(false);
    void this.router.navigate(['/app/issue/produce/step5']);
  }
}
