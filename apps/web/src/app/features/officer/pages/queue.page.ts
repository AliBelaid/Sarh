import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import type { Property, PropertyStatus, PropertyType } from '@sijilli/shared-types';

import { PropertiesService } from '../../../core/properties.service';
import { StatusChipComponent } from '../../../shared/status-chip.component';

const QUEUE_STATUSES: ReadonlyArray<{ value: PropertyStatus | ''; label: string }> = [
  { value: '', label: 'الكل' },
  { value: 'pending', label: 'قيد المراجعة' },
  { value: 'under_review', label: 'تحت المراجعة' },
  { value: 'needs_clarification', label: 'بحاجة إلى توضيح' },
];

const QUEUE_TYPES: ReadonlyArray<{ value: PropertyType | ''; label: string }> = [
  { value: '', label: 'الكل' },
  { value: 'residential', label: 'سكني' },
  { value: 'agricultural', label: 'زراعي' },
  { value: 'commercial', label: 'تجاري' },
  { value: 'governmental', label: 'حكومي' },
];

@Component({
  selector: 'app-officer-queue',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    StatusChipComponent,
  ],
  template: `
    <h1 class="display">طابور المراجعة</h1>

    <mat-card class="filters">
      <div class="filters__row">
        <mat-form-field appearance="outline">
          <mat-label>الحالة</mat-label>
          <mat-select [(value)]="statusFilter">
            @for (s of statuses; track s.value) {
              <mat-option [value]="s.value">{{ s.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>النوع</mat-label>
          <mat-select [(value)]="typeFilter">
            @for (t of types; track t.value) {
              <mat-option [value]="t.value">{{ t.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <button mat-flat-button color="primary" (click)="reload()">
          <mat-icon>filter_list</mat-icon>
          تصفية
        </button>
      </div>
    </mat-card>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <table mat-table [dataSource]="filtered()" class="queue-table">
      <ng-container matColumnDef="parcel">
        <th mat-header-cell *matHeaderCellDef>الرمز / القطعة</th>
        <td mat-cell *matCellDef="let p">{{ p.property_code ?? p.parcel_number ?? '—' }}</td>
      </ng-container>

      <ng-container matColumnDef="type">
        <th mat-header-cell *matHeaderCellDef>النوع</th>
        <td mat-cell *matCellDef="let p">{{ p.property_type }}</td>
      </ng-container>

      <ng-container matColumnDef="area">
        <th mat-header-cell *matHeaderCellDef>المساحة (م²)</th>
        <td mat-cell *matCellDef="let p" class="ltr-num">{{ p.area_sqm ?? '—' }}</td>
      </ng-container>

      <ng-container matColumnDef="submitted">
        <th mat-header-cell *matHeaderCellDef>تاريخ الإرسال</th>
        <td mat-cell *matCellDef="let p" class="ltr-num">
          {{ p.submitted_at | date: 'yyyy-MM-dd HH:mm' }}
        </td>
      </ng-container>

      <ng-container matColumnDef="status">
        <th mat-header-cell *matHeaderCellDef>الحالة</th>
        <td mat-cell *matCellDef="let p">
          <app-status-chip [status]="p.status"></app-status-chip>
        </td>
      </ng-container>

      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef></th>
        <td mat-cell *matCellDef="let p">
          <button mat-icon-button (click)="open(p.id); $event.stopPropagation()" aria-label="فتح">
            <mat-icon>chevron_left</mat-icon>
          </button>
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr
        mat-row
        *matRowDef="let row; columns: displayedColumns"
        class="row-clickable"
        (click)="open(row.id)"
      ></tr>
    </table>

    @if (!loading() && filtered().length === 0) {
      <div class="empty">لا توجد طلبات بهذه التصفية.</div>
    }
  `,
  styles: [
    `
      h1 { margin: 0 0 1rem; color: var(--primary); }
      .filters { padding: 1rem; margin-bottom: 1rem; }
      .filters__row { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
      .queue-table { width: 100%; background: #fff; border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; }
      .row-clickable { cursor: pointer; }
      .row-clickable:hover { background: rgba(212, 175, 55, 0.06); }
      .empty { padding: 3rem 1rem; text-align: center; color: var(--muted); }
      .error { padding: 1rem; color: var(--warn); }
      .ltr-num { direction: ltr; text-align: start; }
    `,
  ],
})
export class OfficerQueuePage implements OnInit {
  private readonly properties = inject(PropertiesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly statuses = QUEUE_STATUSES;
  readonly types = QUEUE_TYPES;
  readonly displayedColumns = ['parcel', 'type', 'area', 'submitted', 'status', 'actions'];

  readonly statusFilter = signal<PropertyStatus | ''>('pending');
  readonly typeFilter = signal<PropertyType | ''>('');

  readonly items = signal<Property[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly filtered = computed(() => {
    const t = this.typeFilter();
    return this.items().filter((p) => (t ? p.property_type === t : true));
  });

  ngOnInit(): void {
    const qStatus = this.route.snapshot.queryParamMap.get('status') as PropertyStatus | null;
    if (qStatus) this.statusFilter.set(qStatus);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.properties.list({
        status: this.statusFilter() || undefined,
        limit: 50,
      });
      this.items.set(res.items);
    } catch (e) {
      this.error.set(this.errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  open(id: string): void {
    void this.router.navigate(['/officer/review', id]);
  }

  private errorMessage(e: unknown): string {
    const anyErr = e as { error?: { error?: { message_ar?: string } }; message?: string };
    return anyErr?.error?.error?.message_ar ?? anyErr?.message ?? 'حدث خطأ غير متوقع.';
  }
}
