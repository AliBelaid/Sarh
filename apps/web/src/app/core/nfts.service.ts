import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { NftNetwork, NftStatus, PropertyNft } from '@sarh/shared-types';
import { API_BASE } from './api-config';

// Server adds two joined columns from the property — saves a per-row roundtrip
// in the ledger UI.
export interface NftLicenseView extends PropertyNft {
  property_code: string | null;
  owner_citizen_id: string | null;
}

export interface ListNftsResponse {
  items: NftLicenseView[];
  next_cursor: string | null;
}

export interface ListNftsParams {
  status?: NftStatus | '';
  network?: NftNetwork | '';
  property_id?: string;
  owner_did?: string;
  cursor?: string;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class NftsService {
  private readonly http = inject(HttpClient);

  list(params: ListNftsParams = {}): Promise<ListNftsResponse> {
    let p = new HttpParams();
    if (params.status) p = p.set('status', params.status);
    if (params.network) p = p.set('network', params.network);
    if (params.property_id) p = p.set('property_id', params.property_id);
    if (params.owner_did) p = p.set('owner_did', params.owner_did);
    if (params.cursor) p = p.set('cursor', params.cursor);
    if (params.limit) p = p.set('limit', String(params.limit));
    return firstValueFrom(this.http.get<ListNftsResponse>(`${API_BASE}/property-nfts`, { params: p }));
  }

  get(id: string): Promise<NftLicenseView> {
    return firstValueFrom(this.http.get<NftLicenseView>(`${API_BASE}/property-nfts/${id}`));
  }
}
