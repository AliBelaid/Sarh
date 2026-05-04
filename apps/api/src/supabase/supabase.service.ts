// Compatibility shim — the file kept its name to minimise churn across
// the 16 services that import it. Underneath, every call now hits local
// SQL Server via DbService instead of Supabase.
//
// Surface still in use across the codebase:
//   supabase.admin.from('table')  → SQL Server query builder
//   supabase.admin.rpc(name, args) → SQL Server stored proc
//
// Dropped (callers were rewritten):
//   supabase.admin.auth      → AuthService now owns sign-in / invite
//   supabase.admin.storage   → StorageService now writes to local FS
//   supabase.forUser(jwt)    → RLS replaced by NestJS guards

import { Injectable, OnModuleInit } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { MsSqlClient } from '../db/query-builder';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private _admin!: MsSqlClient;

  constructor(private readonly db: DbService) {}

  onModuleInit() {
    this._admin = new MsSqlClient(() => this.db.pool());
  }

  get admin(): MsSqlClient {
    return this._admin;
  }
}
