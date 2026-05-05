import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api-config';

export type CardStatus = 'active' | 'frozen' | 'revoked' | 'expired' | 'lost';

export interface DigitalIdCard {
  id: string;
  citizen_id: string;
  digital_id_number: string;
  card_serial: string;
  nfc_uid: string | null;
  did: string | null;
  issued_at: string;
  issued_by_officer_id: string | null;
  expires_at: string;
  status: CardStatus;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardsListResponse {
  items: DigitalIdCard[];
  next_cursor: string | null;
}

export interface ListCardsParams {
  citizen_id?: string;
  status?: CardStatus | '';
  limit?: number;
  cursor?: string;
}

@Injectable({ providedIn: 'root' })
export class DigitalIdCardsService {
  private readonly http = inject(HttpClient);

  list(params: ListCardsParams = {}): Promise<CardsListResponse> {
    let p = new HttpParams();
    if (params.citizen_id) p = p.set('citizen_id', params.citizen_id);
    if (params.status) p = p.set('status', params.status);
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.cursor) p = p.set('cursor', params.cursor);
    return firstValueFrom(
      this.http.get<CardsListResponse>(`${API_BASE}/digital-id-cards`, { params: p }),
    );
  }
}
