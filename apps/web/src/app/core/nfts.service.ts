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
  // True when minted in the standard/simulation flow (no real contract
  // deployed). The UI badges it and hides the dead block-explorer links.
  simulated: boolean;
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

  history(id: string): Promise<OwnershipEvent[]> {
    return firstValueFrom(this.http.get<OwnershipEvent[]>(`${API_BASE}/property-nfts/${id}/history`));
  }

  // Live on-chain verification: RPC reachability + ownerOf + mint-tx receipt
  // against the configured network. Backend: GET /property-nfts/:id/chain-check.
  chainCheck(id: string): Promise<ChainCheckResult> {
    return firstValueFrom(this.http.get<ChainCheckResult>(`${API_BASE}/property-nfts/${id}/chain-check`));
  }

  // Citizen-scoped: returns licences owned by the authenticated citizen.
  // Backend: GET /api/v1/me/nft-licences (Controllers/MeController.cs).
  mine(): Promise<NftLicenseView[]> {
    return firstValueFrom(this.http.get<NftLicenseView[]>(`${API_BASE}/me/nft-licences`));
  }

  transfer(id: string, body: TransferNftRequest): Promise<TransferResult> {
    return firstValueFrom(
      this.http.post<TransferResult>(`${API_BASE}/property-nfts/${id}/transfer`, body),
    );
  }
}

export type TransferReason =
  | 'initial_mint' | 'sale' | 'inheritance' | 'gift' | 'court_order' | 'correction';

export interface OwnershipEvent {
  id: string;
  from_did: string | null;
  to_did: string;
  from_citizen_name: string | null;
  to_citizen_name: string | null;
  reason: TransferReason;
  notes_ar: string | null;
  transfer_tx_hash: string | null;
  transfer_block_number: number | null;
  transferred_at: string;
}

export type TransferableReason = Exclude<TransferReason, 'initial_mint'>;

export interface TransferNftRequest {
  to_citizen_id: string;
  reason: TransferableReason;
  notes_ar?: string;
}

export interface TransferResult {
  nft: NftLicenseView;
  property: { id: string; status: string; owner_citizen_id: string };
  event: OwnershipEvent;
  explorer_tx_url: string;
}

// Live "verify on chain" result for one licence (snake_case from the API).
export interface ChainCheckResult {
  mode: 'real' | 'stub';
  network: string;
  standard: string;
  chain_id: number | null;
  rpc_connected: boolean;
  rpc_host: string | null;
  rpc_error: string | null;
  latest_block: number | null;
  gas_price_gwei: string | null;

  contract_address: string;
  contract_configured: boolean;
  can_sign: boolean;

  token_id: string;
  recorded_owner_address: string;
  on_chain_owner: string | null;
  token_exists_on_chain: boolean | null;
  owner_matches: boolean | null;

  mint_tx_hash: string;
  tx_found: boolean | null;
  tx_block_number: number | null;
  tx_succeeded: boolean | null;

  explorer_tx_url: string;
  explorer_token_url: string;
  metadata_uri: string;
  checked_at: string;
}
