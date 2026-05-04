import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Thin wrapper around the ACA-Py admin HTTP API. Only the subset Sijilli
// needs is surfaced. All methods take the optional sub-wallet token via
// `tenantToken` so the issuer agent's multitenancy mode picks the right
// wallet for the citizen.
//
// When `ACA_PY_ADMIN_URL` is unset, `enabled` is false and the SsiService
// keeps its Phase-5 placeholder behavior. This lets developers run the
// API without standing up the SSI stack.

export interface AcaPyCreateWalletInput {
  wallet_name: string;
  wallet_key: string;
  wallet_dispatch_type?: 'default';
  label: string;
  image_url?: string;
}

export interface AcaPyWalletRecord {
  wallet_id: string;
  token: string;        // short-lived JWT for the new sub-wallet
  settings?: Record<string, unknown>;
  key_management_mode?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AcaPyDidRecord {
  did: string;
  verkey: string;       // public key
  posture?: string;
  method?: string;
}

export interface AcaPySchemaRecord {
  schema_id: string;
  schema?: { id: string; name: string; version: string; attrNames: string[] };
}

export interface AcaPyCredDefRecord {
  credential_definition_id: string;
}

export interface AcaPyIssueCredentialInput {
  connection_id?: string | null;     // null in connectionless mode
  cred_def_id: string;
  attributes: Record<string, string>;
  comment?: string;
  auto_remove?: boolean;
  trace?: boolean;
}

export interface AcaPyCredExRecord {
  cred_ex_id: string;
  state: string;        // 'offer-sent' | 'credential-issued' | ...
  thread_id?: string;
  by_format?: Record<string, unknown>;
}

export interface AcaPyRevokeInput {
  cred_ex_id: string;
  publish?: boolean;
  comment?: string;
}

@Injectable()
export class AcaPyClient {
  private readonly logger = new Logger(AcaPyClient.name);
  private readonly baseUrl: string;
  private readonly adminApiKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (config.get<string>('ACA_PY_ADMIN_URL') ?? '').replace(/\/+$/, '');
    this.adminApiKey = config.get<string>('ACA_PY_ADMIN_API_KEY') ?? '';
  }

  get enabled(): boolean {
    return this.baseUrl.length > 0;
  }

  // -------- multitenancy --------

  async createSubWallet(input: AcaPyCreateWalletInput): Promise<AcaPyWalletRecord> {
    return this.request<AcaPyWalletRecord>('POST', '/multitenancy/wallet', undefined, {
      wallet_name: input.wallet_name,
      wallet_key: input.wallet_key,
      wallet_dispatch_type: input.wallet_dispatch_type ?? 'default',
      label: input.label,
      image_url: input.image_url,
      key_management_mode: 'managed',
      wallet_type: 'askar',
    });
  }

  async createWalletDid(tenantToken: string, method: 'sov' | 'key' = 'sov'): Promise<AcaPyDidRecord> {
    const body = await this.request<{ result: AcaPyDidRecord }>(
      'POST',
      '/wallet/did/create',
      tenantToken,
      { method, options: { key_type: 'ed25519' } },
    );
    return body.result;
  }

  // -------- schemas + cred defs (issuer scope, no tenant token) --------

  async createSchema(input: {
    schema_name: string;
    schema_version: string;
    attributes: string[];
  }): Promise<AcaPySchemaRecord> {
    return this.request<AcaPySchemaRecord>('POST', '/schemas', undefined, input);
  }

  async findSchema(schemaName: string, version: string): Promise<string | null> {
    const params = new URLSearchParams({ schema_name: schemaName, schema_version: version });
    const body = await this.request<{ schema_ids: string[] }>(
      'GET',
      `/schemas/created?${params.toString()}`,
      undefined,
    );
    return body.schema_ids?.[0] ?? null;
  }

  async createCredDef(input: {
    schema_id: string;
    tag: string;
    support_revocation?: boolean;
    revocation_registry_size?: number;
  }): Promise<AcaPyCredDefRecord> {
    return this.request<AcaPyCredDefRecord>('POST', '/credential-definitions', undefined, {
      schema_id: input.schema_id,
      tag: input.tag,
      support_revocation: input.support_revocation ?? true,
      revocation_registry_size: input.revocation_registry_size ?? 1000,
    });
  }

  async findCredDef(schemaId: string, tag: string): Promise<string | null> {
    const params = new URLSearchParams({ schema_id: schemaId, tag });
    const body = await this.request<{ credential_definition_ids: string[] }>(
      'GET',
      `/credential-definitions/created?${params.toString()}`,
      undefined,
    );
    return body.credential_definition_ids?.[0] ?? null;
  }

  // -------- issue / revoke credentials --------

  async sendCredential(
    tenantToken: string,
    input: AcaPyIssueCredentialInput,
  ): Promise<AcaPyCredExRecord> {
    // Connectionless issuance is the right pattern for the citizen mobile
    // app: we surface the credential offer as a QR code that the wallet
    // scans and accepts. ACA-Py supports both `/issue-credential-2.0/send`
    // (connection-based) and `/issue-credential-2.0/create-offer`
    // (connectionless). Sijilli prefers connectionless to keep the issuer
    // stateless w.r.t. the wallet endpoint.
    const path = input.connection_id ? '/issue-credential-2.0/send' : '/issue-credential-2.0/create-offer';
    const filter = {
      indy: {
        cred_def_id: input.cred_def_id,
      },
    };
    const credential_preview = {
      '@type': 'issue-credential/2.0/credential-preview',
      attributes: Object.entries(input.attributes).map(([name, value]) => ({ name, value })),
    };
    return this.request<AcaPyCredExRecord>('POST', path, tenantToken, {
      auto_remove: input.auto_remove ?? false,
      auto_issue: true,
      comment: input.comment,
      connection_id: input.connection_id ?? undefined,
      filter,
      credential_preview,
      trace: input.trace ?? false,
    });
  }

  async revokeCredential(tenantToken: string, input: AcaPyRevokeInput): Promise<{ ok: boolean }> {
    await this.request<unknown>('POST', '/revocation/revoke', tenantToken, {
      cred_ex_id: input.cred_ex_id,
      publish: input.publish ?? true,
      comment: input.comment,
    });
    return { ok: true };
  }

  // -------- low-level --------

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    tenantToken: string | undefined,
    body?: unknown,
  ): Promise<T> {
    if (!this.enabled) {
      throw new Error('AcaPyClient is disabled (ACA_PY_ADMIN_URL not set).');
    }
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.adminApiKey) headers['x-api-key'] = this.adminApiKey;
    if (tenantToken) headers['authorization'] = `Bearer ${tenantToken}`;

    const init: RequestInit = { method, headers };
    if (body !== undefined && method !== 'GET') init.body = JSON.stringify(body);

    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(
        `ACA-Py ${method} ${path} failed: ${res.status} ${text.slice(0, 400)}`,
      );
      throw new Error(`ACA-Py ${path} ${res.status}: ${text.slice(0, 200)}`);
    }
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      this.logger.warn(`ACA-Py ${path} returned non-JSON: ${text.slice(0, 200)}`);
      return text as unknown as T;
    }
  }
}
