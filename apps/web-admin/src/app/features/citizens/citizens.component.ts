import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import type { CitizenSummary } from '@sijilli/shared-types';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { CitizenEditDialog } from './citizen-edit.dialog';

@Component({
  selector: 'sijilli-citizens',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './citizens.component.html',
  styleUrl: './citizens.component.scss',
})
export class CitizensComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private supabase = inject(SupabaseService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  q = '';
  loading = signal(false);
  items = signal<CitizenSummary[]>([]);
  live = signal(false);
  readonly displayedColumns = ['name', 'phone', 'region', 'digital_id', 'actions'];

  private liveSub: Subscription | null = null;
  private liveRows: CitizenSummary[] = [];

  ngOnInit() {
    if (this.auth.isAuthenticated()) {
      this.startLive();
    }
  }

  ngOnDestroy() {
    this.liveSub?.unsubscribe();
  }

  private startLive() {
    this.live.set(true);
    this.loading.set(true);
    this.liveSub = this.supabase
      .liveQuery<CitizenSummary>({
        table: 'citizens',
        order: { column: 'created_at', ascending: false },
        limit: 200,
      })
      .subscribe({
        next: (rows) => {
          this.liveRows = rows;
          this.applyFilter();
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.snack.open(
            err?.message ? `تعذّر البث المباشر: ${err.message}` : 'تعذّر تحميل المواطنين.',
            'حسناً',
            { duration: 5000 },
          );
        },
      });
  }

  private applyFilter() {
    const needle = this.q.trim().toLowerCase();
    if (!needle) {
      this.items.set(this.liveRows);
      return;
    }
    const filtered = this.liveRows.filter((c) => {
      const name = [
        c.first_name_ar,
        c.father_name_ar,
        c.grandfather_name_ar,
        c.family_name_ar,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        name.includes(needle) ||
        (c.phone ?? '').toLowerCase().includes(needle) ||
        (c.digital_id_number ?? '').toLowerCase().includes(needle)
      );
    });
    this.items.set(filtered);
  }

  async search() {
    if (this.live()) {
      this.applyFilter();
      return;
    }
    if (this.q.trim().length < 2) return;
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.api.searchCitizens(this.q.trim()));
      this.items.set(res.items);
    } finally {
      this.loading.set(false);
    }
  }

  fullName(c: CitizenSummary): string {
    return [c.first_name_ar, c.father_name_ar, c.grandfather_name_ar, c.family_name_ar]
      .filter(Boolean)
      .join(' ');
  }

  openCreate() {
    this.dialog
      .open(CitizenEditDialog, { data: null, autoFocus: false })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.snack.open('تم تسجيل المواطن.', 'حسنًا', { duration: 2500 });
      });
  }

  openEdit(row: CitizenSummary) {
    this.dialog
      .open(CitizenEditDialog, { data: row, autoFocus: false })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.snack.open('تم حفظ التغييرات.', 'حسنًا', { duration: 2500 });
      });
  }

  async toggleActive(row: CitizenSummary & { is_active?: boolean }) {
    const next = !(row.is_active ?? true);
    if (!confirm(next ? 'تفعيل هذا الحساب؟' : 'تعطيل هذا الحساب؟')) return;
    const { error } = await this.supabase.client
      .from('citizens')
      .update({ is_active: next })
      .eq('id', row.id);
    if (error) {
      this.snack.open(`تعذّر التحديث: ${error.message}`, 'إغلاق', { duration: 5000 });
      return;
    }
    this.snack.open(next ? 'تم التفعيل.' : 'تم التعطيل.', 'حسنًا', { duration: 2000 });
  }
}
