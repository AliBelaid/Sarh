import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { IdIssuerApiService } from '../../id-issuer-api.service';
import { IdIssuerWizardService } from '../../wizard.service';
import { REGIONS } from '../../../../shared/status-pills';

@Component({
  selector: 'app-id-issuer-step5',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="page">
      <header class="head">
        <h1 class="display">إصدار جديد</h1>
        <p class="sub">راجع البيانات قبل إنشاء سجلّ المواطن في قاعدة البيانات.</p>
      </header>

      <ol class="stepper">
        @for (s of steps; track s.n) {
          <li [class.on]="s.n === 5" [class.done]="s.n < 5">
            <span class="num">{{ s.n }}</span>
            <span class="lbl">{{ s.label }}</span>
          </li>
        }
      </ol>

      <div class="card">
        <div class="card-head">
          <h2>٥ / ٥ — مراجعة وإرسال</h2>
          <p>بعد الإرسال سيُنشأ سجلّ المواطن وتنتقل إلى مرحلة إنتاج البطاقة.</p>
        </div>

        <div class="grid">
          <div class="hero">
            @if (wizard.photoDataUrl()) {
              <img class="hero-photo" [src]="wizard.photoDataUrl()" alt="" />
            } @else {
              <div class="hero-photo placeholder">—</div>
            }
            <div class="hero-info">
              <h3>{{ identity().first_name_ar }} {{ identity().father_name_ar }}
                  {{ identity().grandfather_name_ar }} {{ identity().family_name_ar }}</h3>
              <p>اسم الأم: {{ identity().mother_name_ar }}</p>
              <p>{{ identity().gender === 'male' ? 'ذكر' : 'أنثى' }}
                · <span dir="ltr">{{ identity().dob }}</span></p>
            </div>
          </div>

          <ul class="checks">
            <li>
              <span class="lab">المنطقة</span>
              <span class="val">{{ regionName() }} <span class="mono small">({{ identity().region_code }})</span></span>
            </li>
            <li>
              <span class="lab">الرقم الوطني القديم</span>
              <span class="val mono small">{{ identity().legacy_national_no || '—' }}</span>
            </li>
            <li>
              <span class="lab">الصورة</span>
              <span class="val" [class.ok]="wizard.photoDataUrl()" [class.miss]="!wizard.photoDataUrl()">
                {{ wizard.photoDataUrl() ? '✓ ملتقطة' : '✗ ناقصة' }}
              </span>
            </li>
            <li>
              <span class="lab">التوقيع</span>
              <span class="val" [class.ok]="wizard.signaturePngDataUrl()" [class.miss]="!wizard.signaturePngDataUrl()">
                {{ wizard.signaturePngDataUrl() ? '✓ موجود' : '✗ غير موجود' }}
              </span>
            </li>
            <li>
              <span class="lab">البصمة</span>
              <span class="val" [class.ok]="wizard.fingerprintCaptured()">
                {{ wizard.fingerprintCaptured() ? '✓ ملتقطة' : '— تم التجاوز' }}
              </span>
            </li>
          </ul>
        </div>

        @if (error()) {
          <div class="banner err">
            <span class="banner-mark">!</span>
            {{ error() }}
          </div>
        }

        <div class="actions">
          <button type="button" class="btn-back" (click)="back()" [disabled]="busy()">→ السابق</button>
          <button type="button" class="btn-primary" (click)="submit()" [disabled]="busy()">
            @if (busy()) { جارٍ الإنشاء… } @else { إنشاء سجل المواطن ← }
          </button>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { max-width: 980px; margin: 0 auto; }

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

    .grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }

    .hero { display: flex; gap: 14px; padding: 14px; background: rgba(249, 115, 22, 0.06); border: 1px solid rgba(249, 115, 22, 0.25); border-radius: 12px; }
    .hero-photo {
      width: 90px; height: 110px; border-radius: 8px; object-fit: cover;
      border: 2px solid var(--accent); flex-shrink: 0;
      background: var(--paper);
    }
    .hero-photo.placeholder { display: grid; place-items: center; color: var(--muted); font-size: 22px; }
    .hero-info h3 { margin: 0 0 6px; font-size: 15px; color: var(--ink); }
    .hero-info p  { margin: 2px 0; font-size: 12px; color: var(--muted); }

    .checks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .checks li {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 12px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 8px;
      font-size: 12.5px;
    }
    .checks .lab { color: var(--muted); }
    .checks .val { font-weight: 600; color: var(--ink); }
    .checks .ok  { color: var(--good); }
    .checks .miss { color: var(--warn); }
    .small { font-size: 11px; }

    .banner { margin-top: 14px; padding: 10px 14px; border-radius: 8px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 8px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 12px; font-weight: 700; }

    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--rule); flex-wrap: wrap; }
    .btn-primary, .btn-back {
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 700;
      font-family: inherit; cursor: pointer; transition: all .12s; border: 1px solid;
    }
    .btn-primary { background: var(--primary); color: var(--accent); border-color: var(--primary); }
    .btn-primary:hover:not(:disabled) { background: var(--accent); color: var(--primary); }
    .btn-primary:disabled, .btn-back:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-back { background: transparent; color: var(--muted); border-color: transparent; margin-inline-end: auto; }
    .btn-back:hover:not(:disabled) { color: var(--ink); }
  `],
})
export class IdIssuerStep5Page {
  private readonly router = inject(Router);
  private readonly api = inject(IdIssuerApiService);
  protected readonly wizard = inject(IdIssuerWizardService);

  readonly steps = [
    { n: 1, label: 'الهوية' },
    { n: 2, label: 'الصورة' },
    { n: 3, label: 'التوقيع' },
    { n: 4, label: 'البصمة' },
    { n: 5, label: 'المراجعة' },
  ];

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly identity = computed(() => this.wizard.identity());
  readonly regionName = computed(() => REGIONS[this.identity().region_id] ?? `منطقة ${this.identity().region_id}`);

  back(): void { void this.router.navigate(['/app/issue/produce/step4']); }

  async submit(): Promise<void> {
    const id = this.identity();
    if (
      !id.first_name_ar ||
      !id.father_name_ar ||
      !id.family_name_ar ||
      !id.mother_name_ar ||
      !id.dob ||
      !this.wizard.photoBlob()
    ) {
      this.error.set('بعض الحقول الإلزامية ناقصة. ارجع للخطوات السابقة.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const created = await this.api.createCitizen(id);
      this.wizard.createdCitizenId.set(created.id);
      this.wizard.createdDigitalIdNumber.set(created.digital_id_number ?? null);
      void this.router.navigate(['/app/issue/produce/finalize']);
    } catch (e) {
      this.error.set(this.errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private errorMessage(e: unknown): string {
    const anyErr = e as { error?: { error?: { message_ar?: string } }; message?: string };
    return anyErr?.error?.error?.message_ar ?? anyErr?.message ?? 'تعذّر إنشاء سجل المواطن.';
  }
}
