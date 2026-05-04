import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  PaginatedItems,
  Property,
  PropertyOverlap,
  PropertyDocument,
  ReviewRequest,
  ReviewResponse,
} from '@sijilli/shared-types';

import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listProperties(params: {
    status?: string;
    regionId?: number;
    cursor?: string;
    limit?: number;
  } = {}) {
    let p = new HttpParams().set('limit', String(params.limit ?? 20));
    if (params.status) p = p.set('status', params.status);
    if (params.regionId !== undefined) p = p.set('region_id', String(params.regionId));
    if (params.cursor) p = p.set('cursor', params.cursor);
    return this.http.get<PaginatedItems<Property>>(`${this.base}/properties`, {
      params: p,
    });
  }

  getProperty(id: string) {
    return this.http.get<Property>(`${this.base}/properties/${id}`);
  }

  getPropertyDocuments(id: string) {
    return this.http.get<{ items: PropertyDocument[] }>(
      `${this.base}/properties/${id}/documents`,
    );
  }

  overlapCheck(polygon: Record<string, unknown>) {
    return this.http.post<{ overlaps: PropertyOverlap[] }>(
      `${this.base}/properties/overlap-check`,
      { polygon },
    );
  }

  review(id: string, body: ReviewRequest) {
    return this.http.post<ReviewResponse>(
      `${this.base}/properties/${id}/review`,
      body,
    );
  }
}
