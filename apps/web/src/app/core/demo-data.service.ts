import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api-config';

export interface DemoStatus {
  empty: boolean;
  seed_file_available: boolean;
  can_load: boolean;
  counts: Record<string, number>;
}

export interface DemoLoadResult {
  loaded?: boolean;
  reset?: boolean;
  truncated?: boolean;
  total?: number;
  inserted?: Record<string, number>;
  deleted?: Record<string, number>;
}

// Drives the public "load demo data" first-run flow on the landing page and the
// super_admin reset/truncate controls. Backed by /api/v1/demo-data/* — status +
// load are anonymous; reset/truncate/export require a super_admin JWT.
@Injectable({ providedIn: 'root' })
export class DemoDataService {
  private readonly http = inject(HttpClient);

  status(): Promise<DemoStatus> {
    return firstValueFrom(this.http.get<DemoStatus>(`${API_BASE}/demo-data/status`));
  }

  load(): Promise<DemoLoadResult> {
    return firstValueFrom(this.http.post<DemoLoadResult>(`${API_BASE}/demo-data/load`, {}));
  }

  reset(): Promise<DemoLoadResult> {
    return firstValueFrom(this.http.post<DemoLoadResult>(`${API_BASE}/demo-data/reset`, {}));
  }

  truncate(): Promise<DemoLoadResult> {
    return firstValueFrom(this.http.post<DemoLoadResult>(`${API_BASE}/demo-data/truncate`, {}));
  }

  export(): Promise<{ exported: boolean; total: number; file: string }> {
    return firstValueFrom(
      this.http.get<{ exported: boolean; total: number; file: string }>(`${API_BASE}/demo-data/export`),
    );
  }
}
