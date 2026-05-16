import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  FinalApproveRequest,
  LicenseResult,
  Property,
  PropertyStatus,
  ReviewDecision,
  ReviewResponse,
} from '@sarh/shared-types';
import { API_BASE } from './api-config';

interface ListResponse {
  items: Property[];
  next_cursor: string | null;
}

export interface ListPropertiesParams {
  q?: string;
  status?: PropertyStatus | '';
  limit?: number;
  cursor?: string;
  region_id?: number;
}

export interface ReviewBody {
  decision: ReviewDecision;
  note?: string;
  approval_decree_no?: string;
}

@Injectable({ providedIn: 'root' })
export class PropertiesService {
  private readonly http = inject(HttpClient);

  list(params: ListPropertiesParams = {}): Promise<ListResponse> {
    let p = new HttpParams();
    if (params.q) p = p.set('q', params.q);
    if (params.status) p = p.set('status', params.status);
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.cursor) p = p.set('cursor', params.cursor);
    if (params.region_id !== undefined) p = p.set('region_id', String(params.region_id));
    return firstValueFrom(this.http.get<ListResponse>(`${API_BASE}/properties`, { params: p }));
  }

  get(id: string): Promise<Property> {
    return firstValueFrom(this.http.get<Property>(`${API_BASE}/properties/${id}`));
  }

  review(id: string, body: ReviewBody): Promise<ReviewResponse> {
    return firstValueFrom(
      this.http.post<ReviewResponse>(`${API_BASE}/properties/${id}/review`, body),
    );
  }

  // Department-manager final approval. Mints the NFT licence on chain.
  // Backend: LicenseService.FinalApproveAsync (Workflow/LicenseService.cs).
  finalApprove(id: string, body: FinalApproveRequest = {}): Promise<LicenseResult> {
    return firstValueFrom(
      this.http.post<LicenseResult>(`${API_BASE}/properties/${id}/final-approve`, body),
    );
  }
}
