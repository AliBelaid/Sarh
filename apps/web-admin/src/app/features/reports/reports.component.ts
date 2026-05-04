import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';

interface ReportSummary {
  issuance_today: number;
  approvals_today: number;
  rejections_today: number;
  avg_review_minutes: number | null;
}

interface Totals {
  citizens: number;
  digital_ids: number;
  properties_pending: number;
  properties_approved: number;
}

@Component({
  selector: 'sijilli-reports',
  standalone: true,
  imports: [DecimalPipe, MatCardModule, MatIconModule, MatProgressBarModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private supabase = inject(SupabaseService);

  loading = signal(false);
  summary = signal<ReportSummary | null>(null);
  totals = signal<Totals | null>(null);

  async ngOnInit() {
    this.loading.set(true);
    try {
      // Prefer the API summary if reachable.
      this.summary.set(await firstValueFrom(this.api.reportsSummary()));
    } catch {
      // Fall back to live Supabase counts so the page reflects real data.
      this.summary.set(await this.computeSummaryFromSupabase());
    }
    if (this.auth.isAuthenticated()) {
      this.totals.set(await this.computeTotals());
    }
    this.loading.set(false);
  }

  private todayUtcIso(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  private async computeSummaryFromSupabase(): Promise<ReportSummary> {
    const startOfDay = this.todayUtcIso();
    const s = this.supabase.client;

    const [issuance, approvals, rejections, reviewed] = await Promise.all([
      s.from('digital_id_cards')
        .select('id', { count: 'exact', head: true })
        .gte('issued_at', startOfDay),
      s.from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_table', 'properties')
        .eq('action', 'approve')
        .gte('occurred_at', startOfDay),
      s.from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_table', 'properties')
        .eq('action', 'reject')
        .gte('occurred_at', startOfDay),
      s.from('properties')
        .select('submitted_at, reviewed_at')
        .not('reviewed_at', 'is', null)
        .gte('reviewed_at', startOfDay)
        .limit(500),
    ]);

    let avg: number | null = null;
    const rows = (reviewed.data ?? []) as { submitted_at: string | null; reviewed_at: string | null }[];
    if (rows.length > 0) {
      const minutes = rows
        .map((r) => {
          if (!r.submitted_at || !r.reviewed_at) return null;
          const ms = new Date(r.reviewed_at).getTime() - new Date(r.submitted_at).getTime();
          return ms > 0 ? ms / 60000 : null;
        })
        .filter((v): v is number => v !== null);
      if (minutes.length > 0) {
        avg = minutes.reduce((a, b) => a + b, 0) / minutes.length;
      }
    }

    return {
      issuance_today: issuance.count ?? 0,
      approvals_today: approvals.count ?? 0,
      rejections_today: rejections.count ?? 0,
      avg_review_minutes: avg,
    };
  }

  private async computeTotals(): Promise<Totals> {
    const s = this.supabase.client;
    const [citizens, digitalIds, pending, approved] = await Promise.all([
      s.from('citizens').select('id', { count: 'exact', head: true }),
      s.from('digital_id_cards').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      s.from('properties').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      s.from('properties').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    ]);
    return {
      citizens: citizens.count ?? 0,
      digital_ids: digitalIds.count ?? 0,
      properties_pending: pending.count ?? 0,
      properties_approved: approved.count ?? 0,
    };
  }
}
