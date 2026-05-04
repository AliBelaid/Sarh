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
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import type { SijilliRole } from '@sijilli/shared-types';

import { ApiService, Officer } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { SijilliApiError } from '../../core/api.interceptor';
import { OfficerEditDialog } from './officer-edit.dialog';

@Component({
  selector: 'sijilli-officers',
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
    MatSelectModule,
    MatTableModule,
    MatSnackBarModule,
  ],
  templateUrl: './officers.component.html',
  styleUrl: './officers.component.scss',
})
export class OfficersComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private supabase = inject(SupabaseService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  loading = signal(false);
  items = signal<Officer[]>([]);
  live = signal(false);
  readonly displayedColumns = ['name', 'role', 'region', 'email', 'active', 'actions'];

  private liveSub: Subscription | null = null;

  ngOnInit() {
    if (this.auth.isAuthenticated()) {
      this.startLive();
    } else {
      void this.refresh();
    }
  }

  ngOnDestroy() {
    this.liveSub?.unsubscribe();
  }

  private startLive() {
    this.live.set(true);
    this.loading.set(true);
    this.liveSub = this.supabase
      .liveQuery<Officer>({
        table: 'officers',
        order: { column: 'created_at', ascending: false },
        limit: 200,
      })
      .subscribe({
        next: (rows) => {
          this.items.set(rows);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.snack.open(
            err?.message ? `تعذّر البث المباشر: ${err.message}` : 'تعذّر تحميل الموظّفين.',
            'حسناً',
            { duration: 5000 },
          );
        },
      });
  }

  async refresh() {
    if (this.live()) return; // realtime stream is authoritative
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.api.listOfficers());
      this.items.set(res.items);
    } catch (e) {
      this.snack.open(
        e instanceof SijilliApiError ? e.messageAr : 'تعذّر تحميل الموظّفين.',
        'حسناً',
        { duration: 4000 },
      );
    } finally {
      this.loading.set(false);
    }
  }

  edit(officer?: Officer) {
    const ref = this.dialog.open(OfficerEditDialog, {
      data: officer ?? null,
      width: '720px',
    });
    ref.afterClosed().subscribe((saved: Officer | null | undefined) => {
      if (saved && !this.live()) this.refresh();
    });
  }

  rolesAr(role: SijilliRole): string {
    const map: Record<SijilliRole, string> = {
      super_admin: 'مدير عام',
      registry_officer: 'موظّف سجل',
      id_issuer: 'موظّف إصدار',
      auditor: 'مدقق',
      reviewer: 'مراجع',
      citizen: 'مواطن',
    };
    return map[role] ?? role;
  }
}
