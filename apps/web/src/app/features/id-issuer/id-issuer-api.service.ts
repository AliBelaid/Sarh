import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../../core/api-config';

export interface CitizenCreateBody {
  first_name_ar: string;
  father_name_ar: string;
  grandfather_name_ar: string;
  family_name_ar: string;
  mother_name_ar: string;
  gender: 'male' | 'female';
  dob: string;
  region_id: number;
  region_code: string;
  municipality_id?: number | null;
  legacy_national_no?: string | null;
  phone?: string | null;
  photo_path?: string | null;
}

export interface CitizenCreated {
  id: string;
  digital_id_number?: string | null;
}

export interface CardIssueBody {
  citizen_id: string;
  region_code: string;
  year?: number;
  validity_years?: number;
  photo_path?: string;
}

export interface CardIssueResponse {
  card: {
    id: string;
    digital_id_number: string;
    card_serial: string;
    expires_at: string;
    status: string;
    [k: string]: unknown;
  };
  nfc_keys: {
    meta_read_key_hex: string;
    sdm_file_read_key_hex: string;
    kms_key_id: string;
  };
  sun_url_template: string;
}

export interface NfcEncodeBody {
  card_id: string;
  meta_read_key_hex: string;
  sdm_file_read_key_hex: string;
  sun_url_template: string;
}

export interface NfcEncodeResponse {
  ok: boolean;
  uid?: string;
  picc_offset?: number;
  cmac_offset?: number;
  error?: string;
}

const NFC_HELPER_URL =
  (typeof window !== 'undefined' &&
    (window as unknown as { __SIJILLI_NFC_HELPER__?: string }).__SIJILLI_NFC_HELPER__) ||
  'http://localhost:8081';

@Injectable({ providedIn: 'root' })
export class IdIssuerApiService {
  private readonly http = inject(HttpClient);

  createCitizen(body: CitizenCreateBody): Promise<CitizenCreated> {
    return firstValueFrom(this.http.post<CitizenCreated>(`${API_BASE}/citizens`, body));
  }

  issueCard(body: CardIssueBody): Promise<CardIssueResponse> {
    return firstValueFrom(
      this.http.post<CardIssueResponse>(`${API_BASE}/digital-id-cards/issue`, body),
    );
  }

  encodeNfc(body: NfcEncodeBody): Promise<NfcEncodeResponse> {
    return firstValueFrom(this.http.post<NfcEncodeResponse>(`${NFC_HELPER_URL}/nfc/encode`, body));
  }
}
