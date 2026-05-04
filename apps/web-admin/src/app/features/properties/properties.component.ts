import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { Property } from '@sijilli/shared-types';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { PropertyReviewDialog } from './property-review.dialog';

type StatusKey = '' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'needs_clarification' | 'frozen';

@Component({
  selector: 'sijilli-admin-properties',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './properties.component.html',
  styleUrl: './properties.component.scss',
})
export class AdminPropertiesComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private supabase = inject(SupabaseService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  loading = signal(false);
  rows = signal<Property[]>([]);
  live = signal(false);
  statusFilter = signal<StatusKey>('');

  readonly displayedColumns = [
    'code',
    'type',
    'area',
    'status',
    'region',
    'submitted',
    'actions',
  ];

  readonly items = computed(() => {
    const f = this.statusFilter();
    return f ? this.rows().filter((r) => r.status === f) : this.rows();
  });

  readonly counts = computed(() => {
    const all = this.rows();
    const buckets: Record<string, number> = {
      pending: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      needs_clarification: 0,
      frozen: 0,
    };
    for (const r of all) {
      const k = r.status as string;
      if (k in buckets) buckets[k]++;
    }
    return buckets;
  });

  private liveSub: Subscription | null = null;

  async ngOnInit() {
    if (this.auth.isAuthenticated()) {
      this.startLive();
      return;
    }
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.api.listProperties({}));
      this.rows.set(res.items);
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.liveSub?.unsubscribe();
  }

  private startLive() {
    this.live.set(true);
    this.loading.set(true);
    this.liveSub = this.supabase
      .liveQuery<Property>({
        table: 'properties',
        order: { column: 'submitted_at', ascending: false },
        limit: 200,
      })
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.snack.open(
            err?.message ? `تعذّر البث المباشر: ${err.message}` : 'تعذّر تحميل العقارات.',
            'حسناً',
            { duration: 5000 },
          );
        },
      });
  }

  setFilter(f: StatusKey) {
    this.statusFilter.set(f);
  }

  typeLabel(t?: string): string {
    return ({
      residential: 'سكني',
      agricultural: 'زراعي',
      commercial: 'تجاري',
      governmental: 'حكومي',
      industrial: 'صناعي',
      mixed: 'متعدد',
    } as Record<string, string>)[t ?? ''] ?? (t ?? '—');
  }

  statusLabel(s?: string): string {
    return ({
      draft: 'مسودة',
      pending: 'قيد الانتظار',
      under_review: 'قيد المراجعة',
      approved: 'معتمد',
      rejected: 'مرفوض',
      needs_clarification: 'يحتاج توضيحًا',
      frozen: 'مجمَّد',
    } as Record<string, string>)[s ?? ''] ?? (s ?? '—');
  }

  statusClass(s?: string): string {
    return `status status--${s ?? 'unknown'}`;
  }

  openReview(row: Property) {
    this.dialog
      .open(PropertyReviewDialog, { data: row, autoFocus: false })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.snack.open('تم تسجيل القرار.', 'حسنًا', { duration: 2500 });
      });
  }

  async quickApprove(row: Property) {
    if (!confirm(`اعتماد العقار ${row.property_code || row.parcel_number || ''}؟`)) return;
    const now = new Date().toISOString();
    const { error } = await this.supabase.client
      .from('properties')
      .update({ status: 'approved', reviewed_at: now, updated_at: now, rejection_reason: null })
      .eq('id', row.id);
    if (error) {
      this.snack.open(`تعذّر الاعتماد: ${error.message}`, 'إغلاق', { duration: 5000 });
      return;
    }
    await this.supabase.client.from('audit_log').insert({
      actor_kind: 'officer',
      actor_id: this.auth.profile()?.user?.id ?? null,
      action: 'approve',
      entity_table: 'properties',
      entity_id: row.id,
      before_state: { status: row.status },
      after_state: { status: 'approved', quick: true },
    });
    this.snack.open('تم الاعتماد.', 'حسنًا', { duration: 2000 });
  }
}
