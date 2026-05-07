import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api-config';

export type CardStatus = 'active' | 'frozen' | 'revoked' | 'expired' | 'lost';

export interface CardCitizenSummary {
  id: string;
  first_name_ar: string;
  father_name_ar: string;
  family_name_ar: string;
  region_id: number | null;
  phone: string | null;
}

export interface DigitalIdCard {
  id: string;
  citizen_id: string;
  digital_id_number: string;
  card_serial: string;
  nfc_uid: string | null;
  did: string | null;
  did_doc: string | null;
  wallet_endpoint: string | null;
  issued_at: string;
  issued_by_officer_id: string | null;
  expires_at: string;
  status: CardStatus;
  revoked_at: string | null;
  revoked_reason: string | null;
  photo_hash: string | null;
  data_hash: string | null;
  last_nfc_counter: number;
  last_nfc_tap_at: string | null;
  created_at: string;
  updated_at: string;
  citizen: CardCitizenSummary | null;
}

export interface CardsListResponse {
  items: DigitalIdCard[];
  next_cursor: string | null;
}

export interface ListCardsParams {
  citizen_id?: string;
  status?: CardStatus | '';
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface IssueCardPayload {
  citizen_id: string;
  region_code: string;
  year?: number;
  validity_years?: number;
  photo_bucket?: string;
  photo_path?: string;
  photo_sha256?: string;
}

export interface IssueCardResult {
  card: DigitalIdCard;
  nfc_keys: {
    meta_read_key_hex: string;
    sdm_file_read_key_hex: string;
    kms_key_id: string;
  };
  sun_url_template: string;
}

@Injectable({ providedIn: 'root' })
export class DigitalIdCardsService {
  private readonly http = inject(HttpClient);

  list(params: ListCardsParams = {}): Promise<CardsListResponse> {
    let p = new HttpParams();
    if (params.citizen_id) p = p.set('citizen_id', params.citizen_id);
    if (params.status) p = p.set('status', params.status);
    if (params.q) p = p.set('q', params.q);
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.cursor) p = p.set('cursor', params.cursor);
    return firstValueFrom(
      this.http.get<CardsListResponse>(`${API_BASE}/digital-id-cards`, { params: p }),
    );
  }

  issue(payload: IssueCardPayload): Promise<IssueCardResult> {
    return firstValueFrom(
      this.http.post<IssueCardResult>(`${API_BASE}/digital-id-cards/issue`, payload),
    );
  }

  freeze(id: string, reason: string): Promise<DigitalIdCard> {
    return firstValueFrom(
      this.http.post<DigitalIdCard>(`${API_BASE}/digital-id-cards/${id}/freeze`, { reason }),
    );
  }

  revoke(id: string, reason: string): Promise<DigitalIdCard> {
    return firstValueFrom(
      this.http.post<DigitalIdCard>(`${API_BASE}/digital-id-cards/${id}/revoke`, { reason }),
    );
  }

  reissue(id: string, reason: string, keepDigitalIdNumber = false): Promise<IssueCardResult> {
    return firstValueFrom(
      this.http.post<IssueCardResult>(`${API_BASE}/digital-id-cards/${id}/reissue`, {
        reason,
        keep_digital_id_number: keepDigitalIdNumber,
      }),
    );
  }

  resetPin(id: string): Promise<ResetPinResult> {
    return firstValueFrom(
      this.http.post<ResetPinResult>(`${API_BASE}/digital-id-cards/${id}/reset-pin`, {}),
    );
  }
}

export interface ResetPinResult {
  card_id: string;
  pin: string;
  set_at: string;
}
