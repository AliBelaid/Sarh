import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ApiService, AuditEntry } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';

interface AuditRow extends AuditEntry {
  expanded?: boolean;
}

@Component({
  selector: 'sijilli-audit',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTableModule,
    MatSnackBarModule,
  ],
  templateUrl: './audit.component.html',
  styleUrl: './audit.component.scss',
})
export class AuditComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private supabase = inject(SupabaseService);
  private snack = inject(MatSnackBar);

  loading = signal(false);
  rows = signal<AuditRow[]>([]);
  live = signal(false);
  filterActor = '';
  filterAction = '';
  filterEntity = '';
  expandedId = signal<number | null>(null);

  readonly displayedColumns = ['time', 'actor', 'action', 'entity', 'details'];

  readonly items = computed(() => {
    const actor = this.filterActor.trim().toLowerCase();
    const action = this.filterAction.trim().toLowerCase();
    const entity = this.filterEntity.trim().toLowerCase();
    return this.rows().filter((a) => {
      if (actor && !(a.actor_id ?? '').toLowerCase().includes(actor)) return false;
      if (action && !a.action.toLowerCase().includes(action)) return false;
      if (entity && !a.entity_table.toLowerCase().includes(entity)) return false;
      return true;
    });
  });

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
      .liveQuery<AuditRow>({
        table: 'audit_log',
        order: { column: 'occurred_at', ascending: false },
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
            err?.message ? `تعذّر البث المباشر: ${err.message}` : 'تعذّر تحميل سجلّ التدقيق.',
            'حسناً',
            { duration: 5000 },
          );
        },
      });
  }

  async refresh() {
    if (this.live()) return;
    this.loading.set(true);
    try {
      const res = await firstValueFrom(
        this.api.listAudit({
          actor: this.filterActor || undefined,
          action: this.filterAction || undefined,
          entity: this.filterEntity || undefined,
        }),
      );
      this.rows.set(res.items);
    } finally {
      this.loading.set(false);
    }
  }

  toggle(row: AuditRow) {
    this.expandedId.set(this.expandedId() === row.id ? null : row.id);
  }

  hasDetails(row: AuditRow): boolean {
    return !!(row.before_state || row.after_state);
  }

  // -- labels -------------------------------------------------------------
  actionLabel(a: string): string {
    return ({
      create: 'إنشاء',
      update: 'تحديث',
      delete: 'حذف',
      approve: 'اعتماد',
      reject: 'رفض',
      issue_id: 'إصدار هوية',
      revoke_id: 'إلغاء هوية',
      view: 'عرض',
      login: 'تسجيل دخول',
    } as Record<string, string>)[a] ?? a;
  }

  actorLabel(kind: AuditEntry['actor_kind']): string {
    return ({
      officer: 'موظّف',
      citizen: 'مواطن',
      system: 'النظام',
    } as Record<string, string>)[kind] ?? kind;
  }

  entityLabel(t: string): string {
    return ({
      citizens: 'المواطنون',
      properties: 'العقارات',
      digital_id_cards: 'البطاقات الرقمية',
      officers: 'الموظّفون',
      registration_requests: 'طلبات التسجيل',
      property_documents: 'مستندات العقارات',
      notifications: 'الإشعارات',
      ssi_credentials: 'الشهادات الرقمية',
      ssi_wallets: 'المحافظ الرقمية',
    } as Record<string, string>)[t] ?? t;
  }

  actionClass(a: string): string {
    return `act act--${a}`;
  }

  // -- diff rendering -----------------------------------------------------
  diffRows(row: AuditRow): { key: string; before: string; after: string }[] {
    const before = (row.before_state ?? {}) as Record<string, unknown>;
    const after = (row.after_state ?? {}) as Record<string, unknown>;
    const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].map((k) => ({
      key: k,
      before: this.fmt(before[k]),
      after: this.fmt(after[k]),
    }));
  }

  private fmt(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
}
