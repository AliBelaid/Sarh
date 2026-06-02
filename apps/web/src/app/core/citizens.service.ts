import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api-config';

// Snake-case JSON shape returned by the .NET API.
export interface Citizen {
  id: string;
  first_name_ar: string;
  father_name_ar: string;
  grandfather_name_ar: string;
  family_name_ar: string;
  first_name_en?: string | null;
  father_name_en?: string | null;
  grandfather_name_en?: string | null;
  family_name_en?: string | null;
  mother_name_ar?: string | null;
  legacy_national_no?: string | null;
  family_book_no?: string | null;
  gender: string;
  birth_date: string;
  birth_place?: string | null;
  nationality?: string | null;
  marital_status?: string | null;
  phone?: string | null;
  email?: string | null;
  region_id?: number | null;
  municipality_id?: number | null;
  address_ar?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CitizensListResponse {
  items: Citizen[];
  next_cursor: string | null;
}

export interface ListCitizensParams {
  q?: string;
  region_id?: number;
  limit?: number;
  cursor?: string;
}

// PATCH payload — omit a field to leave it unchanged. Editing the Arabic
// quadruple name or birth_date re-derives the bound card's data_hash server-side.
export interface UpdateCitizenPayload {
  first_name_ar?: string;
  father_name_ar?: string;
  grandfather_name_ar?: string;
  family_name_ar?: string;
  birth_date?: string; // yyyy-MM-dd
  first_name_en?: string;
  father_name_en?: string;
  grandfather_name_en?: string;
  family_name_en?: string;
  mother_name_ar?: string;
  legacy_national_no?: string;
  family_book_no?: string;
  birth_place?: string;
  marital_status?: string;
  phone?: string;
  email?: string;
  region_id?: number;
  municipality_id?: number;
  address_ar?: string;
}

@Injectable({ providedIn: 'root' })
export class CitizensService {
  private readonly http = inject(HttpClient);

  list(params: ListCitizensParams = {}): Promise<CitizensListResponse> {
    let p = new HttpParams();
    if (params.q) p = p.set('q', params.q);
    if (params.region_id !== undefined) p = p.set('region_id', String(params.region_id));
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.cursor) p = p.set('cursor', params.cursor);
    return firstValueFrom(this.http.get<CitizensListResponse>(`${API_BASE}/citizens`, { params: p }));
  }

  get(id: string): Promise<Citizen> {
    return firstValueFrom(this.http.get<Citizen>(`${API_BASE}/citizens/${id}`));
  }

  update(id: string, payload: UpdateCitizenPayload): Promise<Citizen> {
    return firstValueFrom(this.http.patch<Citizen>(`${API_BASE}/citizens/${id}`, payload));
  }
}
