import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { IdIssuerApiService } from '../../id-issuer-api.service';
import { IdIssuerWizardService } from '../../wizard.service';

@Component({
  selector: 'app-id-issuer-step5',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressBarModule],
  template: `
    <h1 class="display">٥ / ٥ — مراجعة وإرسال</h1>

    @if (busy()) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <mat-card class="summary">
      <mat-card-content>
        <h2 class="hero">
          {{ identity().first_name_ar }} {{ identity().father_name_ar }}
          {{ identity().grandfather_name_ar }} {{ identity().family_name_ar }}
        </h2>
        <div class="grid-2">
          <div><span class="muted">اسم الأم:</span> {{ identity().mother_name_ar }}</div>
          <div>
            <span class="muted">الجنس:</span>
            {{ identity().gender === 'male' ? 'ذكر' : 'أنثى' }}
          </div>
          <div>
            <span class="muted">تاريخ الميلاد:</span>
            <span dir="ltr">{{ identity().dob }}</span>
          </div>
          <div>
            <span class="muted">المنطقة:</span>
            <span dir="ltr">{{ identity().region_code }}</span>
          </div>
          <div>
            <span class="muted">الصورة:</span>
            @if (wizard.photoDataUrl()) { ✓ } @else { غير موجودة }
          </div>
          <div>
            <span class="muted">التوقيع:</span>
            @if (wizard.signaturePngDataUrl()) { ✓ } @else { غير موجود }
          </div>
          <div>
            <span class="muted">البصمة:</span>
            @if (wizard.fingerprintCaptured()) { ✓ } @else { تم التجاوز }
          </div>
        </div>

        @if (error()) {
          <div class="error">
            <mat-icon>error_outline</mat-icon> {{ error() }}
          </div>
        }

        <div class="actions">
          <button
            mat-flat-button
            color="primary"
            [disabled]="busy()"
            (click)="submit()"
          >
            إنشاء سجل المواطن
          </button>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      h1 { margin: 0 0 0.5rem; color: var(--primary); }
      .summary { margin-top: 1rem; }
      .hero { margin: 0 0 1rem; color: var(--primary); }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; }
      .muted { color: var(--muted); margin-inline-end: 0.25rem; }
      .error {
        margin-top: 1rem;
        color: var(--warn);
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .actions { margin-top: 1rem; display: flex; justify-content: flex-end; }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class IdIssuerStep5Page {
  private readonly router = inject(Router);
  private readonly api = inject(IdIssuerApiService);
  protected readonly wizard = inject(IdIssuerWizardService);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly identity = computed(() => this.wizard.identity());

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
      void this.router.navigate(['/id-issuer/produce/issue']);
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
