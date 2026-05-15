import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { IdIssuerWizardService } from '../../wizard.service';
import { REGIONS } from '../../../../shared/status-pills';

@Component({
  selector: 'app-id-issuer-step1',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page fade-in">
      <header class="head">
        <h1 class="display">إصدار جديد</h1>
        <p class="sub">أكمل المعالج بخمس خطوات لإنشاء سجل المواطن وإصدار بطاقة الهويّة الرقميّة.</p>
      </header>

      <div class="progress-bar">
        <div class="progress-fill" style="width: 20%"></div>
      </div>

      <ol class="stepper">
        @for (s of steps; track s.n) {
          <li [class.on]="s.n === 1" [class.done]="s.n < 1">
            <span class="num">{{ s.n }}</span>
            <span class="lbl">{{ s.label }}</span>
          </li>
        }
      </ol>

      <div class="card">
        <div class="card-head">
          <h2>١ / ٥ — بيانات الهوية</h2>
          <p>أدخل الاسم الرباعي واسم الأم وتاريخ الميلاد والمنطقة.</p>
        </div>

        <div class="grid">
          <label>
            <span>الاسم الأول</span>
            <input type="text" [(ngModel)]="draft.first_name_ar" name="first" />
          </label>
          <label>
            <span>اسم الأب</span>
            <input type="text" [(ngModel)]="draft.father_name_ar" name="father" />
          </label>
          <label>
            <span>اسم الجد</span>
            <input type="text" [(ngModel)]="draft.grandfather_name_ar" name="grandfather" />
          </label>
          <label>
            <span>اللقب</span>
            <input type="text" [(ngModel)]="draft.family_name_ar" name="family" />
          </label>
          <label class="span-2">
            <span>اسم الأم</span>
            <input type="text" [(ngModel)]="draft.mother_name_ar" name="mother" />
          </label>
          <label>
            <span>تاريخ الميلاد</span>
            <input type="date" [(ngModel)]="draft.dob" name="dob" dir="ltr" />
          </label>
          <div class="field">
            <span class="lab">الجنس</span>
            <div class="radios">
              <label class="radio">
                <input type="radio" name="gender" value="male" [(ngModel)]="draft.gender" />
                <span>ذكر</span>
              </label>
              <label class="radio">
                <input type="radio" name="gender" value="female" [(ngModel)]="draft.gender" />
                <span>أنثى</span>
              </label>
            </div>
          </div>
          <label>
            <span>المنطقة</span>
            <select [(ngModel)]="draft.region_id" name="region_id" (ngModelChange)="onRegion($event)">
              @for (r of regions; track r.id) {
                <option [ngValue]="r.id">{{ r.name }} ({{ r.id }})</option>
              }
            </select>
          </label>
          <label>
            <span>رمز المنطقة</span>
            <input type="text" [(ngModel)]="draft.region_code" name="region_code" dir="ltr" />
          </label>
          <label class="span-2">
            <span>الرقم الوطني القديم (إن وجد)</span>
            <input type="text" [(ngModel)]="draft.legacy_national_no" name="legacy" dir="ltr" />
          </label>
        </div>

        <div class="actions">
          <button type="button" class="btn-primary" (click)="next()">التالي ←</button>
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

    .progress-bar {
      height: 4px;
      background: var(--rule);
      border-radius: 2px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), #C2410C);
      border-radius: 2px;
      transition: width .4s ease;
    }

    .stepper {
      list-style: none; padding: 0; margin: 0 0 18px;
      display: flex; gap: 4px; flex-wrap: wrap;
      counter-reset: step;
    }
    .stepper li {
      flex: 1; min-width: 120px;
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .stepper li.on { border-color: var(--primary); color: var(--ink); }
    .stepper li.on .num { background: var(--primary); color: var(--accent); }
    .stepper li.done .num { background: var(--good); color: #fff; }
    .num {
      width: 22px; height: 22px;
      display: grid; place-items: center;
      border-radius: 50%;
      background: var(--rule);
      color: var(--muted);
      font-weight: 700; font-size: 11px;
      flex-shrink: 0;
    }
    .lbl { font-weight: 600; }

    .card {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      padding: 22px;
    }
    .card-head { margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--rule); }
    .card-head h2 { margin: 0 0 4px; font-size: 16px; color: var(--ink); }
    .card-head p  { margin: 0; font-size: 12.5px; color: var(--muted); }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .grid .span-2 { grid-column: span 2; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } .grid .span-2 { grid-column: auto; } }

    label, .field { display: flex; flex-direction: column; gap: 6px; }
    label > span, .field .lab { font-size: 11.5px; color: var(--muted); font-weight: 600; }
    input[type=text], input[type=date], select {
      padding: 9px 12px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
      transition: border-color .12s;
    }
    input:focus, select:focus { outline: none; border-color: var(--accent); }

    .radios { display: flex; gap: 14px; padding-top: 4px; }
    .radio { flex-direction: row; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; }
    .radio input { accent-color: var(--primary); }

    .actions { display: flex; justify-content: flex-end; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--rule); }
    .btn-primary {
      padding: 9px 18px;
      background: var(--primary); color: var(--accent);
      border: 1px solid var(--primary);
      border-radius: 8px;
      font-size: 13px; font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      transition: all .12s;
    }
    .btn-primary:hover { background: var(--accent); color: var(--primary); }
  `],
})
export class IdIssuerStep1Page {
  private readonly router = inject(Router);
  protected readonly wizard = inject(IdIssuerWizardService);

  readonly steps = [
    { n: 1, label: 'الهوية' },
    { n: 2, label: 'الصورة' },
    { n: 3, label: 'التوقيع' },
    { n: 4, label: 'البصمة' },
    { n: 5, label: 'المراجعة' },
  ];

  readonly regions = Object.entries(REGIONS).map(([id, name]) => ({ id: Number(id), name }));

  draft = { ...this.wizard.identity() };

  onRegion(id: number): void {
    this.draft.region_code = String(id);
  }

  next(): void {
    if (
      !this.draft.first_name_ar.trim() ||
      !this.draft.father_name_ar.trim() ||
      !this.draft.family_name_ar.trim() ||
      !this.draft.mother_name_ar.trim() ||
      !this.draft.dob
    ) {
      return;
    }
    this.wizard.identity.set({ ...this.draft });
    void this.router.navigate(['/app/issue/produce/step2']);
  }
}
