import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mssql from 'mssql';

// Single connection pool reused by every query in the API.
//
// The pool is initialised lazily on first request — `mssql.connect()` is
// blocking and we don't want it in module init. Subsequent callers await
// the same in-flight connection promise.
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private _pool!: mssql.ConnectionPool;
  private _ready: Promise<mssql.ConnectionPool> | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    // Eager connect so the first request doesn't pay the latency.
    this.ready().catch((e) => this.logger.error('DB pool init failed', e));
  }

  async onModuleDestroy() {
    if (this._pool?.connected) await this._pool.close();
  }

  ready(): Promise<mssql.ConnectionPool> {
    if (this._ready) return this._ready;

    const cfg = this.buildConfig();
    this._pool = new mssql.ConnectionPool(cfg);
    const pending: Promise<mssql.ConnectionPool> = this._pool
      .connect()
      .then((p: mssql.ConnectionPool) => {
        this.logger.log(`SQL Server pool connected (server=${cfg.server}, db=${cfg.database})`);
        return p;
      })
      .catch((e: unknown) => {
        this._ready = null; // allow retry on next call
        throw e;
      });
    this._ready = pending;
    return pending;
  }

  // Untyped raw query. Prefer the query-builder; this is for one-offs.
  async raw<T = unknown>(sql: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const pool = await this.ready();
    const req = pool.request();
    for (const [k, v] of Object.entries(params)) req.input(k, mssqlType(v), v);
    const result = await req.query<T>(sql);
    return result.recordset as T[];
  }

  // Stored-procedure call. Returns the first recordset (or empty array).
  // If the proc emits a single scalar SELECT (one row, one column), the
  // caller can read recordset[0][firstKey]. If the proc uses OUTPUT
  // parameters, those land in result.output.
  async exec(
    procName: string,
    params: Record<string, unknown> = {},
  ): Promise<{
    recordset: unknown[];
    output: Record<string, unknown>;
  }> {
    const pool = await this.ready();
    const req = pool.request();
    for (const [k, v] of Object.entries(params)) req.input(k, mssqlType(v), v);
    const result = await req.execute(procName);
    return { recordset: (result.recordset ?? []) as unknown[], output: result.output ?? {} };
  }

  // Expose the pool for advanced cases (transactions).
  pool(): Promise<mssql.ConnectionPool> {
    return this.ready();
  }

  // ------------------------------------------------------------------
  // Build the mssql config from env. Supports either:
  //   - SQL Auth:   MSSQL_USER + MSSQL_PASSWORD
  //   - Win Auth:   leave both empty (uses trustedConnection)
  // The DATABASE_URL Prisma uses is shaped differently, so we prefer
  // discrete env vars here for clarity.
  // ------------------------------------------------------------------
  private buildConfig(): mssql.config {
    const server = this.config.get<string>('MSSQL_SERVER') ?? 'localhost';
    const database = this.config.get<string>('MSSQL_DATABASE') ?? 'sijilli';
    const port = parseInt(this.config.get<string>('MSSQL_PORT') ?? '1433', 10);
    const user = this.config.get<string>('MSSQL_USER');
    const password = this.config.get<string>('MSSQL_PASSWORD');
    const encrypt = (this.config.get<string>('MSSQL_ENCRYPT') ?? 'true') === 'true';
    const trustServerCertificate =
      (this.config.get<string>('MSSQL_TRUST_CERT') ?? 'true') === 'true';

    const base: mssql.config = {
      server,
      database,
      port,
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
      options: {
        encrypt,
        trustServerCertificate,
        enableArithAbort: true,
        useUTC: true,
      },
    };

    if (user && password) {
      return { ...base, user, password };
    }
    return {
      ...base,
      authentication: { type: 'ntlm', options: { domain: '', userName: '', password: '' } },
      options: { ...base.options, trustedConnection: true } as mssql.config['options'],
    };
  }
}

// Best-effort mapping from JS values to mssql types. Mirrors what the
// Supabase JS client did implicitly.
function mssqlType(v: unknown): mssql.ISqlType {
  if (v === null || v === undefined) return mssql.NVarChar(mssql.MAX) as unknown as mssql.ISqlType;
  if (Buffer.isBuffer(v)) return mssql.VarBinary(mssql.MAX) as unknown as mssql.ISqlType;
  if (v instanceof Date) return mssql.DateTimeOffset() as unknown as mssql.ISqlType;
  if (typeof v === 'boolean') return mssql.Bit() as unknown as mssql.ISqlType;
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? (mssql.Int() as unknown as mssql.ISqlType)
      : (mssql.Decimal(18, 6) as unknown as mssql.ISqlType);
  }
  if (typeof v === 'string') {
    // UUID-shaped strings -> UNIQUEIDENTIFIER for tighter binding.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      return mssql.UniqueIdentifier() as unknown as mssql.ISqlType;
    }
    return mssql.NVarChar(mssql.MAX) as unknown as mssql.ISqlType;
  }
  // Objects / arrays -> JSON-encoded NVARCHAR(MAX).
  return mssql.NVarChar(mssql.MAX) as unknown as mssql.ISqlType;
}
