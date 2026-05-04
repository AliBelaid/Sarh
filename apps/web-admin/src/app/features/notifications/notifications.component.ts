import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { SupabaseService } from '../../core/supabase.service';

interface NotificationRow {
  id: string;
  recipient_citizen_id: string | null;
  recipient_officer_id: string | null;
  kind: 'sms' | 'push' | 'email' | 'in_app';
  title_ar: string | null;
  body_ar: string | null;
  payload: Record<string, unknown> | null;
  sent_at: string | null;
  read_at: string | null;
  delivery_status: string | null;
}

type KindFilter = '' | 'sms' | 'push' | 'email' | 'in_app';
type RecipientFilter = '' | 'citizen' | 'officer';

@Component({
  selector: 'sijilli-notifications',
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
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsAdminComponent implements OnInit, OnDestroy {
  private supabase = inject(SupabaseService);
  private snack = inject(MatSnackBar);

  loading = signal(false);
  rows = signal<NotificationRow[]>([]);
  live = signal(false);

  query = signal('');
  kindFilter = signal<KindFilter>('');
  recipientFilter = signal<RecipientFilter>('');

  readonly items = computed(() => {
    const q = this.query().trim().toLowerCase();
    const k = this.kindFilter();
    const r = this.recipientFilter();
    return this.rows().filter((n) => {
      if (k && n.kind !== k) return false;
      if (r === 'citizen' && !n.recipient_citizen_id) return false;
      if (r === 'officer' && !n.recipient_officer_id) return false;
      if (q) {
        const hay = `${n.title_ar ?? ''} ${n.body_ar ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  readonly counts = computed(() => {
    const all = this.rows();
    return {
      total: all.length,
      unread: all.filter((n) => !n.read_at).length,
      in_app: all.filter((n) => n.kind === 'in_app').length,
      sms: all.filter((n) => n.kind === 'sms').length,
    };
  });

  private liveSub: Subscription | null = null;

  ngOnInit() {
    this.startLive();
  }

  ngOnDestroy() {
    this.liveSub?.unsubscribe();
  }

  private startLive() {
    this.live.set(true);
    this.loading.set(true);
    this.liveSub = this.supabase
      .liveQuery<NotificationRow>({
        table: 'notifications',
        order: { column: 'sent_at', ascending: false },
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
            err?.message ? `تعذّر تحميل الإشعارات: ${err.message}` : 'تعذّر تحميل الإشعارات.',
            'إغلاق',
            { duration: 5000 },
          );
        },
      });
  }

  kindLabel(k: NotificationRow['kind']): string {
    return ({
      sms: 'رسالة نصية',
      push: 'إشعار دفع',
      email: 'بريد',
      in_app: 'داخل التطبيق',
    } as Record<string, string>)[k] ?? k;
  }

  kindIcon(k: NotificationRow['kind']): string {
    return ({
      sms: 'sms',
      push: 'notifications_active',
      email: 'mail',
      in_app: 'campaign',
    } as Record<string, string>)[k] ?? 'notifications';
  }

  recipientLabel(n: NotificationRow): string {
    if (n.recipient_citizen_id) return `مواطن · ${n.recipient_citizen_id.slice(0, 8)}`;
    if (n.recipient_officer_id) return `موظّف · ${n.recipient_officer_id.slice(0, 8)}`;
    return 'بثّ عام';
  }

  payloadSnippet(p: Record<string, unknown> | null): string {
    if (!p || Object.keys(p).length === 0) return '';
    const entries = Object.entries(p)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' · ');
    return entries;
  }

  async markRead(n: NotificationRow) {
    if (n.read_at) return;
    const { error } = await this.supabase.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', n.id);
    if (error) {
      this.snack.open(`تعذّر التحديث: ${error.message}`, 'إغلاق', { duration: 4000 });
    }
  }
}
