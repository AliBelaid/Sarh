import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import type { Property, ReviewDecision } from '@sijilli/shared-types';

import { PropertiesService } from '../../../core/properties.service';
import { StatusChipComponent } from '../../../shared/status-chip.component';

@Component({
  selector: 'app-officer-review',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    StatusChipComponent,
  ],
  template: `
    @if (loading()) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    @if (error()) {
      <mat-card class="error-card">
        <mat-icon>error_outline</mat-icon>
        <span>{{ error() }}</span>
      </mat-card>
    }

    @if (property(); as p) {
      <div class="review-grid">
        <mat-card class="hero">
          <mat-card-content>
            <div class="hero__row">
              <div class="hero__title">
                <h1 class="display">{{ p.property_code ?? 'طلب جديد' }}</h1>
                <div class="muted">رقم القطعة: {{ p.parcel_number ?? '—' }}</div>
              </div>
              <app-status-chip [status]="p.status"></app-status-chip>
            </div>
            <mat-divider class="my"></mat-divider>
            <div class="grid-2">
              <div><span class="muted">النوع:</span> {{ p.property_type }}</div>
              <div>
                <span class="muted">المساحة:</span>
                <span class="ltr-num">{{ p.area_sqm ?? '—' }} م²</span>
              </div>
              <div><span class="muted">المنطقة:</span> {{ p.region_id ?? '—' }}</div>
              <div><span class="muted">العنوان:</span> {{ p.address_ar ?? '—' }}</div>
              <div>
                <span class="muted">تاريخ الإرسال:</span>
                <span class="ltr-num">{{ p.submitted_at | date: 'yyyy-MM-dd HH:mm' }}</span>
              </div>
              <div>
                <span class="muted">آخر مراجعة:</span>
                <span class="ltr-num">{{ p.reviewed_at | date: 'yyyy-MM-dd HH:mm' }}</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="map-placeholder">
          <mat-card-header><mat-card-title>الخريطة</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="map-stub">
              <mat-icon>map</mat-icon>
              <span>سيتم عرض حدود العقار على Mapbox هنا.</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="decision">
          <mat-card-header><mat-card-title>القرار</mat-card-title></mat-card-header>
          <mat-card-content>
            <mat-button-toggle-group
              [value]="decision()"
              (change)="decision.set($event.value)"
              aria-label="القرار"
            >
              <mat-button-toggle value="approve">اعتماد</mat-button-toggle>
              <mat-button-toggle value="needs_clarification">طلب توضيح</mat-button-toggle>
              <mat-button-toggle value="reject">رفض</mat-button-toggle>
            </mat-button-toggle-group>

            @if (decision() === 'approve') {
              <mat-form-field appearance="outline" class="full mt">
                <mat-label>رقم القرار الإداري (اختياري)</mat-label>
                <input
                  matInput
                  [value]="decreeNo()"
                  (input)="decreeNo.set($any($event.target).value)"
                />
              </mat-form-field>
            }

            <mat-form-field appearance="outline" class="full mt">
              <mat-label>ملاحظة للمواطن</mat-label>
              <textarea
                matInput
                rows="4"
                [value]="note()"
                (input)="note.set($any($event.target).value)"
              ></textarea>
            </mat-form-field>

            <button
              mat-flat-button
              color="primary"
              class="full mt"
              (click)="submit()"
              [disabled]="busy()"
            >
              تأكيد القرار
            </button>
          </mat-card-content>
        </mat-card>
      </div>
    }
  `,
  styles: [
    `
      .review-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
      .review-grid > .hero { grid-column: span 2; }
      @media (max-width: 1100px) {
        .review-grid { grid-template-columns: 1fr; }
        .review-grid > .hero { grid-column: auto; }
      }
      .hero__row { display: flex; align-items: center; justify-content: space-between; }
      .hero__title h1 { margin: 0; color: var(--primary); }
      .muted { color: var(--muted); margin-inline-end: 0.25rem; }
      .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem 1rem; }
      .my { margin: 1rem 0; }
      .full { width: 100%; }
      .mt { margin-top: 1rem; }
      .ltr-num { direction: ltr; }
      .error-card {
        color: var(--warn);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
      }
      .map-placeholder .map-stub {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 3rem 0;
        color: var(--muted);
        background: #fafafa;
        border-radius: 8px;
      }
    `,
  ],
})
export class OfficerReviewPage {
  @Input() id?: string;

  private readonly properties = inject(PropertiesService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly property = signal<Property | null>(null);
  readonly busy = signal(false);

  readonly decision = signal<ReviewDecision>('approve');
  readonly note = signal('');
  readonly decreeNo = signal('');

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    if (!this.id) {
      this.error.set('معرّف العقار غير صالح.');
      this.loading.set(false);
      return;
    }
    try {
      const p = await this.properties.get(this.id);
      this.property.set(p);
    } catch (e) {
      this.error.set(this.errorMessage(e, 'تعذّر تحميل العقار.'));
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    const p = this.property();
    if (!p) return;
    const decision = this.decision();
    if (
      (decision === 'reject' || decision === 'needs_clarification') &&
      this.note().trim().length < 3
    ) {
      this.snack.open('الملاحظة إلزامية للرفض وطلب التوضيح.', 'حسناً', { duration: 4000 });
      return;
    }
    this.busy.set(true);
    try {
      await this.properties.review(p.id, {
        decision,
        note: this.note().trim() || undefined,
        approval_decree_no: this.decreeNo().trim() || undefined,
      });
      this.snack.open('تم تنفيذ القرار.', 'حسناً', { duration: 3000 });
      void this.router.navigate(['/officer/queue']);
    } catch (e) {
      this.snack.open(this.errorMessage(e, 'تعذّر حفظ القرار.'), 'حسناً', { duration: 5000 });
    } finally {
      this.busy.set(false);
    }
  }

  private errorMessage(e: unknown, fallback: string): string {
    const anyErr = e as { error?: { error?: { message_ar?: string } }; message?: string };
    return anyErr?.error?.error?.message_ar ?? anyErr?.message ?? fallback;
  }
}
