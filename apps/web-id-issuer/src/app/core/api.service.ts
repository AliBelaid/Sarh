import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

// Shape kept loose here because the citizen create endpoint accepts a
// large body and the response surfaces the digital_id_number we'll then
// hand to /digital-id-cards/issue.
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

export interface CardIssueBody {
  citizen_id: string;
  region_code: string;
  year?: number;
  validity_years?: number;
  photo_sha256?: string;
  photo_path?: string;
  photo_bucket?: string;
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

export interface NfcHelperEncodeBody {
  card_id: string;
  meta_read_key_hex: string;
  sdm_file_read_key_hex: string;
  sun_url_template: string;
}

export interface NfcHelperEncodeResponse {
  ok: boolean;
  uid?: string;
  picc_offset?: number;
  cmac_offset?: number;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;
  private readonly nfcHelper = environment.nfcHelperUrl;

  createCitizen(body: CitizenCreateBody) {
    return this.http.post<{ id: string; digital_id_number?: string }>(
      `${this.base}/citizens`,
      body,
    );
  }

  uploadCitizenPhoto(citizenId: string, file: Blob) {
    const form = new FormData();
    form.append('file', file, 'photo.png');
    return this.http.post<{ storage_path: string; sha256: string }>(
      `${this.base}/citizens/${citizenId}/photo`,
      form,
    );
  }

  issueCard(body: CardIssueBody) {
    return this.http.post<CardIssueResponse>(`${this.base}/digital-id-cards/issue`, body);
  }

  encodeNfc(body: NfcHelperEncodeBody) {
    return this.http.post<NfcHelperEncodeResponse>(
      `${this.nfcHelper}/nfc/encode`,
      body,
    );
  }
}
