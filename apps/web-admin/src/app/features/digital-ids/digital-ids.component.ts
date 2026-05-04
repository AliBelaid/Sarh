import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiService, DigitalIdCard } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { SijilliApiError } from '../../core/api.interceptor';
import { DigitalIdEditDialog } from './digital-id-edit.dialog';

@Component({
  selector: 'sijilli-digital-ids',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './digital-ids.component.html',
  styleUrl: './digital-ids.component.scss',
})
export class DigitalIdsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private supabase = inject(SupabaseService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  readonly loading = signal(false);
  readonly items = signal<DigitalIdCard[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly statusFilter = signal<'' | 'active' | 'frozen' | 'revoked'>('');
  readonly query = signal('');
  readonly live = signal(false);

  private liveSub: Subscription | null = null;
  private liveRows: DigitalIdCard[] = [];

  readonly displayedColumns = [
    'digital_id_number',
    'citizen',
    'status',
    'issued_at',
    'expires_at',
    'did',
    'actions',
  ];

  ngOnInit(): void {
    if (this.auth.isDemo()) {
      void this.refresh();
    } else {
      this.startLive();
    }
  }

  ngOnDestroy(): void {
    this.liveSub?.unsubscribe();
  }

  private startLive(): void {
    this.live.set(true);
    this.loading.set(true);
    this.liveSub = this.supabase
      .liveQuery<DigitalIdCard>({
        table: 'digital_id_cards',
        select:
          '*, citizen:citizens(id, first_name_ar, father_name_ar, family_name_ar, region_id, phone)',
        order: { column: 'issued_at', ascending: false },
        limit: 200,
      })
      .subscribe({
        next: (rows) => {
          this.liveRows = rows;
          this.applyFilter();
          this.nextCursor.set(null);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.snack.open(
            err?.message ? `تعذّر البث المباشر: ${err.message}` : 'تعذّر البث المباشر.',
            'إغلاق',
            { duration: 5000 },
          );
        },
      });
  }

  private applyFilter(): void {
    const status = this.statusFilter();
    const q = this.query().trim().toLowerCase();
    let filtered = this.liveRows;
    if (status) filtered = filtered.filter((r) => r.status === status);
    if (q) {
      filtered = filtered.filter((r) =>
        (r.digital_id_number || '').toLowerCase().includes(q) ||
        this.fullName(r).toLowerCase().includes(q),
      );
    }
    this.items.set(filtered);
  }

  async refresh(append = false): Promise<void> {
    if (this.live()) {
      this.applyFilter();
      return;
    }
    this.loading.set(true);
    try {
      const status = this.statusFilter();
      const q = this.query().trim();
      const cursor = append ? this.nextCursor() ?? undefined : undefined;
      const res = await firstValueFrom(
        this.api.listDigitalIds({ status: status || undefined, q: q || undefined, cursor }),
      );
      this.items.set(append ? [...this.items(), ...res.items] : res.items);
      this.nextCursor.set(res.next_cursor);
    } catch (err) {
      const msg =
        err instanceof SijilliApiError ? err.messageAr : 'تعذّر تحميل الهويّات.';
      this.snack.open(msg, 'إغلاق', { duration: 4000 });
    } finally {
      this.loading.set(false);
    }
  }

  fullName(card: DigitalIdCard): string {
    const c = card.citizen;
    if (!c) return '—';
    return [c.first_name_ar, c.father_name_ar, c.family_name_ar]
      .filter((s): s is string => !!s)
      .join(' ');
  }

  statusColor(s: DigitalIdCard['status']): 'primary' | 'warn' | 'accent' {
    if (s === 'revoked') return 'warn';
    if (s === 'frozen') return 'accent';
    return 'primary';
  }

  statusLabel(s: DigitalIdCard['status']): string {
    if (s === 'active') return 'فعّالة';
    if (s === 'frozen') return 'مجمّدة';
    return 'ملغاة';
  }

  // -- lifecycle actions --------------------------------------------------
  openIssue() {
    this.dialog
      .open(DigitalIdEditDialog, { data: null, autoFocus: false })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.snack.open('تم إصدار البطاقة.', 'حسنًا', { duration: 2500 });
      });
  }

  openEdit(row: DigitalIdCard) {
    this.dialog
      .open(DigitalIdEditDialog, { data: row, autoFocus: false })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.snack.open('تم حفظ التغييرات.', 'حسنًا', { duration: 2500 });
      });
  }

  async setStatus(row: DigitalIdCard, status: DigitalIdCard['status'], reason?: string) {
    if (!row.id) return;
    const payload: Record<string, unknown> = { status };
    if (status === 'revoked') {
      payload['revoked_at'] = new Date().toISOString();
      payload['revoked_reason'] = reason ?? 'لم يُذكر';
    } else {
      payload['revoked_at'] = null;
      payload['revoked_reason'] = null;
    }
    const { error } = await this.supabase.client
      .from('digital_id_cards')
      .update(payload)
      .eq('id', row.id);
    if (error) {
      this.snack.open(`تعذّر التحديث: ${error.message}`, 'إغلاق', { duration: 5000 });
      return;
    }
    this.snack.open(
      status === 'frozen'
        ? 'تمّ تجميد البطاقة.'
        : status === 'revoked'
          ? 'تمّ إلغاء البطاقة.'
          : 'تمّ تفعيل البطاقة.',
      'حسنًا',
      { duration: 2500 },
    );
  }

  async confirmRevoke(row: DigitalIdCard) {
    const reason = window.prompt('سبب الإلغاء:', '');
    if (reason === null) return;
    await this.setStatus(row, 'revoked', reason || 'لم يُذكر');
  }
}
