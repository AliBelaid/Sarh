import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api-config';

export interface Officer {
  id: string;
  auth_user_id: string;
  employee_no: string;
  full_name_ar: string;
  full_name_en: string | null;
  role: string;
  region_id: number | null;
  municipality_id: number | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OfficersListResponse {
  items: Officer[];
  next_cursor: string | null;
}

export interface ListOfficersParams {
  q?: string;
  role?: string;
  region_id?: number;
  is_active?: boolean;
  limit?: number;
  cursor?: string;
}

export interface CreateOfficerPayload {
  email: string;
  password: string;
  full_name_ar: string;
  full_name_en?: string;
  employee_no: string;
  role: string;
  region_id?: number;
  municipality_id?: number;
  phone?: string;
  permissions?: string;
}

export interface UpdateOfficerPayload {
  full_name_ar?: string;
  full_name_en?: string;
  employee_no?: string;
  role?: string;
  region_id?: number;
  municipality_id?: number;
  phone?: string;
  email?: string;
  permissions?: string;
}

@Injectable({ providedIn: 'root' })
export class OfficersService {
  private readonly http = inject(HttpClient);

  list(params: ListOfficersParams = {}): Promise<OfficersListResponse> {
    let p = new HttpParams();
    if (params.q) p = p.set('q', params.q);
    if (params.role) p = p.set('role', params.role);
    if (params.region_id !== undefined) p = p.set('region_id', String(params.region_id));
    if (params.is_active !== undefined) p = p.set('is_active', String(params.is_active));
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.cursor) p = p.set('cursor', params.cursor);
    return firstValueFrom(this.http.get<OfficersListResponse>(`${API_BASE}/officers`, { params: p }));
  }

  get(id: string): Promise<Officer> {
    return firstValueFrom(this.http.get<Officer>(`${API_BASE}/officers/${id}`));
  }

  create(payload: CreateOfficerPayload): Promise<Officer> {
    return firstValueFrom(this.http.post<Officer>(`${API_BASE}/officers`, payload));
  }

  update(id: string, payload: UpdateOfficerPayload): Promise<Officer> {
    return firstValueFrom(this.http.patch<Officer>(`${API_BASE}/officers/${id}`, payload));
  }

  setActive(id: string, isActive: boolean): Promise<Officer> {
    return firstValueFrom(
      this.http.post<Officer>(`${API_BASE}/officers/${id}/set-active`, { is_active: isActive }),
    );
  }
}
