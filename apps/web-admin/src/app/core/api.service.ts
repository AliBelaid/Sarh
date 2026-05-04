import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import type {
  CitizenSummary,
  PaginatedItems,
  Property,
  SijilliRole,
} from '@sijilli/shared-types';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import {
  MOCK_DIGITAL_IDS,
  MOCK_OFFICERS,
  MOCK_CITIZENS,
  MOCK_PROPERTIES,
  MOCK_AUDIT,
  MOCK_REPORTS_SUMMARY,
} from './demo-data';

export interface Officer {
  id: string;
  employee_no: string;
  full_name_ar: string;
  full_name_en?: string | null;
  role: SijilliRole;
  region_id: number | null;
  municipality_id: number | null;
  phone: string | null;
  email: string | null;
  permissions: Record<string, boolean | string | number>;
  is_active: boolean;
}

export interface DigitalIdCard {
  id: string;
  citizen_id: string;
  digital_id_number: string;
  card_serial: string | null;
  nfc_uid?: string | null;
  status: 'active' | 'frozen' | 'revoked';
  issued_at: string;
  issued_by_officer_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  did: string | null;
  citizen?: {
    id: string;
    first_name_ar: string;
    father_name_ar: string | null;
    family_name_ar: string;
    region_id: number | null;
    phone: string | null;
  } | null;
}

export interface AuditEntry {
  id: number;
  actor_kind: 'officer' | 'citizen' | 'system';
  actor_id: string | null;
  action: string;
  entity_table: string;
  entity_id: string | null;
  occurred_at: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly base = environment.apiBaseUrl;

  // 100ms simulated latency for mock responses so spinners actually flash.
  private mock<T>(value: T): Observable<T> {
    return of(value).pipe(delay(100));
  }

  // -- officers ---------------------------------------------------------
  listOfficers() {
    if (this.auth.isDemo()) return this.mock({ items: MOCK_OFFICERS });
    return this.http.get<{ items: Officer[] }>(`${this.base}/officers`);
  }
  saveOfficer(o: Partial<Officer> & { id?: string }) {
    if (this.auth.isDemo()) {
      // No-op write in demo mode — return the input enriched with an id.
      return this.mock({ ...(o as Officer), id: o.id ?? `demo-${Date.now()}` });
    }
    if (o.id) {
      return this.http.patch<Officer>(`${this.base}/officers/${o.id}`, o);
    }
    return this.http.post<Officer>(`${this.base}/officers`, o);
  }

  // -- digital identities ----------------------------------------------
  listDigitalIds(opts: { status?: string; q?: string; cursor?: string } = {}) {
    if (this.auth.isDemo()) {
      let items = MOCK_DIGITAL_IDS;
      if (opts.status) items = items.filter((c) => c.status === opts.status);
      if (opts.q) {
        const q = opts.q.toLowerCase();
        items = items.filter((c) => c.digital_id_number.toLowerCase().includes(q));
      }
      return this.mock({ items, next_cursor: null });
    }
    let p = new HttpParams().set('limit', '50');
    if (opts.status) p = p.set('status', opts.status);
    if (opts.q) p = p.set('q', opts.q);
    if (opts.cursor) p = p.set('cursor', opts.cursor);
    return this.http.get<{ items: DigitalIdCard[]; next_cursor: string | null }>(
      `${this.base}/digital-id-cards`,
      { params: p },
    );
  }

  // -- citizens ---------------------------------------------------------
  searchCitizens(q: string) {
    if (this.auth.isDemo()) {
      const needle = q.toLowerCase();
      const items = MOCK_CITIZENS.filter((c) => {
        if (!needle) return true;
        const name = [c.first_name_ar, c.father_name_ar, c.grandfather_name_ar, c.family_name_ar]
          .filter((s): s is string => !!s)
          .join(' ')
          .toLowerCase();
        return (
          name.includes(needle) ||
          (c.phone ?? '').toLowerCase().includes(needle) ||
          (c.digital_id_number ?? '').toLowerCase().includes(needle)
        );
      });
      return this.mock({ items });
    }
    let params = new HttpParams().set('q', q).set('limit', '50');
    return this.http.get<{ items: CitizenSummary[] }>(`${this.base}/citizens/search`, {
      params,
    });
  }

  // -- properties (oversight: all regions) -----------------------------
  listProperties(opts: { status?: string; regionId?: number; cursor?: string } = {}) {
    if (this.auth.isDemo()) {
      let items = MOCK_PROPERTIES;
      if (opts.status) items = items.filter((p) => (p as unknown as { status: string }).status === opts.status);
      if (opts.regionId !== undefined) items = items.filter((p) => p.region_id === opts.regionId);
      return this.mock({ items, next_cursor: null } as unknown as PaginatedItems<Property>);
    }
    let p = new HttpParams().set('limit', '50');
    if (opts.status) p = p.set('status', opts.status);
    if (opts.regionId !== undefined) p = p.set('region_id', String(opts.regionId));
    if (opts.cursor) p = p.set('cursor', opts.cursor);
    return this.http.get<PaginatedItems<Property>>(`${this.base}/properties`, {
      params: p,
    });
  }

  // -- audit log --------------------------------------------------------
  listAudit(opts: { actor?: string; action?: string; entity?: string } = {}) {
    if (this.auth.isDemo()) {
      let items = MOCK_AUDIT;
      if (opts.action) items = items.filter((a) => a.action === opts.action);
      if (opts.entity) items = items.filter((a) => a.entity_table === opts.entity);
      return this.mock({ items });
    }
    let p = new HttpParams().set('limit', '100');
    if (opts.actor) p = p.set('actor_id', opts.actor);
    if (opts.action) p = p.set('action', opts.action);
    if (opts.entity) p = p.set('entity_table', opts.entity);
    return this.http.get<{ items: AuditEntry[] }>(`${this.base}/audit-log`, {
      params: p,
    });
  }

  // -- reports ----------------------------------------------------------
  reportsSummary() {
    if (this.auth.isDemo()) return this.mock(MOCK_REPORTS_SUMMARY);
    return this.http.get<{
      issuance_today: number;
      approvals_today: number;
      rejections_today: number;
      avg_review_minutes: number | null;
    }>(`${this.base}/reports/summary`);
  }
}
