// Supabase-shaped query builder over SQL Server. Mirrors enough of
// `@supabase/supabase-js`'s PostgREST builder so the rest of the API can
// keep using the same call sites:
//
//   client.from('citizens').select('*').eq('id', x).maybeSingle()
//   client.from('t').insert(obj).select('*').single()
//   client.from('t').update(patch).eq('id', x).select(cols).single()
//   client.rpc('proc_name', { p_arg: val })
//
// Awaiting a builder returns `{ data, error }`. `data` is an array unless
// `.single()` or `.maybeSingle()` was called.

import * as mssql from 'mssql';

export interface QueryError {
  message: string;
  code?: string;
}

export interface QueryResult<T> {
  data: T;
  error: QueryError | null;
  count?: number;
}

interface FilterOp {
  col: string;
  op: '=' | '<' | '>' | '<=' | '>=' | 'IN' | 'IS NULL' | 'IS NOT NULL' | 'LIKE' | 'ILIKE';
  value?: unknown;
}

// Columns that hold JSON. Reads come back as strings; the builder parses
// them to objects to match Supabase JSONB behavior. Writes accept objects
// and stringify automatically.
const JSON_COLUMNS = new Set([
  'permissions',
  'did_doc',
  'payload',
  'before_state',
  'after_state',
  'raw_app_meta_data',
  'raw_user_meta_data',
]);

// SQL Server error number → loose Postgres-equivalent code, just for the
// few callsites that compare `error.code === '23505'` etc.
const ERR_CODE_MAP: Record<number, string> = {
  2627: '23505', // Violation of UNIQUE KEY constraint
  2601: '23505', // Cannot insert duplicate key row
  547: '23503',  // FOREIGN KEY violation
  515: '23502',  // NOT NULL violation
};

function mapErr(e: unknown): QueryError {
  const msg = (e as { message?: string })?.message ?? String(e);
  const num = (e as { number?: number })?.number;
  const code = num != null ? ERR_CODE_MAP[num] ?? String(num) : undefined;
  return { message: msg, code };
}

function toJsonReadable(row: Record<string, unknown>): Record<string, unknown> {
  for (const k of Object.keys(row)) {
    if (JSON_COLUMNS.has(k) && typeof row[k] === 'string') {
      try {
        row[k] = JSON.parse(row[k] as string);
      } catch {
        // leave as-is
      }
    }
  }
  return row;
}

function jsonifyForWrite(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (JSON_COLUMNS.has(k) && v !== null && v !== undefined && typeof v === 'object' && !Buffer.isBuffer(v)) {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Loose row type. Supabase's JS client uses `any` here for the same reason —
// the API surface predates first-class types and 16 services rely on field
// access without per-table generics. We pass the generic through for IDE
// hints but the final `data` is typed as `any` so single/list narrowing
// doesn't matter at the type-system level.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class TableQuery<T = AnyRow> implements PromiseLike<QueryResult<AnyRow>> {
  private projection = '*';
  private filters: FilterOp[] = [];
  private orderBy: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private writeRow: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private patch: Record<string, unknown> | null = null;
  private terminalKind: 'list' | 'single' | 'maybeSingle' = 'list';
  private rawOr: string | null = null;

  constructor(private readonly pool: () => Promise<mssql.ConnectionPool>, private readonly table: string) {}

  // ----- chainable filters / projection ------------------------------
  select(cols: string = '*'): this {
    this.projection = cols.replace(/\s+/g, ' ').trim() || '*';
    if (this.mode === 'select') return this;
    // For insert/update with .select(), keep mode but remember projection.
    return this;
  }
  eq(col: string, v: unknown): this {
    this.filters.push({ col, op: '=', value: v });
    return this;
  }
  lt(col: string, v: unknown): this {
    this.filters.push({ col, op: '<', value: v });
    return this;
  }
  gt(col: string, v: unknown): this {
    this.filters.push({ col, op: '>', value: v });
    return this;
  }
  lte(col: string, v: unknown): this {
    this.filters.push({ col, op: '<=', value: v });
    return this;
  }
  gte(col: string, v: unknown): this {
    this.filters.push({ col, op: '>=', value: v });
    return this;
  }
  in(col: string, vals: readonly unknown[]): this {
    this.filters.push({ col, op: 'IN', value: vals });
    return this;
  }
  is(col: string, v: null): this {
    this.filters.push({ col, op: v === null ? 'IS NULL' : 'IS NOT NULL' });
    return this;
  }
  like(col: string, pattern: string): this {
    this.filters.push({ col, op: 'LIKE', value: pattern });
    return this;
  }
  ilike(col: string, pattern: string): this {
    // SQL Server is case-insensitive by default with our collation.
    this.filters.push({ col, op: 'LIKE', value: pattern });
    return this;
  }
  // Supabase free-form OR: "col.ilike.%foo%,other.eq.x"
  or(filterStr: string): this {
    this.rawOr = filterStr;
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  // ----- terminal modes ----------------------------------------------
  insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[]): this {
    this.mode = 'insert';
    this.writeRow = Array.isArray(rowOrRows)
      ? rowOrRows.map(jsonifyForWrite)
      : jsonifyForWrite(rowOrRows);
    return this;
  }
  update(patch: Record<string, unknown>): this {
    this.mode = 'update';
    this.patch = jsonifyForWrite(patch);
    return this;
  }
  delete(): this {
    this.mode = 'delete';
    return this;
  }
  single(): this {
    this.terminalKind = 'single';
    return this;
  }
  maybeSingle(): this {
    this.terminalKind = 'maybeSingle';
    return this;
  }

  // PromiseLike — `await q` triggers execution.
  then<R1, R2 = never>(
    onFulfilled?: ((v: QueryResult<AnyRow>) => R1 | PromiseLike<R1>) | undefined | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | undefined | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onFulfilled, onRejected);
  }

  // -------------------------------------------------------------------
  private async execute(): Promise<QueryResult<AnyRow>> {
    try {
      const pool = await this.pool();
      const req = pool.request();
      const params: Record<string, unknown> = {};

      let sql: string;
      switch (this.mode) {
        case 'select':
          sql = this.buildSelect(params);
          break;
        case 'insert':
          sql = this.buildInsert(params);
          break;
        case 'update':
          sql = this.buildUpdate(params);
          break;
        case 'delete':
          sql = this.buildDelete(params);
          break;
      }

      bindParams(req, params);
      const result = await req.query(sql);
      const rows = ((result.recordset ?? []) as Record<string, unknown>[]).map(toJsonReadable);

      if (this.terminalKind === 'single') {
        if (rows.length === 0) {
          return { data: null, error: { message: 'No rows returned (single)' } };
        }
        if (rows.length > 1) {
          return { data: null, error: { message: 'More than one row (single)' } };
        }
        return { data: rows[0], error: null };
      }
      if (this.terminalKind === 'maybeSingle') {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: mapErr(e) };
    }
  }

  // ---------------- SQL builders ----------------
  private buildSelect(params: Record<string, unknown>): string {
    const top = this.limitN != null && this.terminalKind !== 'maybeSingle' && this.terminalKind !== 'single'
      ? `TOP (${this.limitN}) `
      : this.terminalKind !== 'list'
        ? `TOP 2 `
        : '';
    const where = this.buildWhere(params);
    const order = this.orderBy.length
      ? ' ORDER BY ' + this.orderBy.map((o) => `[${o.col}] ${o.asc ? 'ASC' : 'DESC'}`).join(', ')
      : '';
    return `SELECT ${top}${this.projection === '*' ? '*' : this.projection} FROM [${this.table}]${where}${order}`;
  }

  private buildInsert(params: Record<string, unknown>): string {
    const rows = Array.isArray(this.writeRow) ? this.writeRow : [this.writeRow!];
    if (rows.length === 0) return `SELECT TOP 0 * FROM [${this.table}]`;
    const cols = Object.keys(rows[0]);
    const valSqls: string[] = [];
    rows.forEach((row, idx) => {
      const ph: string[] = [];
      cols.forEach((c) => {
        const p = `p_${idx}_${c}`;
        params[p] = row[c];
        ph.push(`@${p}`);
      });
      valSqls.push(`(${ph.join(', ')})`);
    });
    const inserted = this.projection === '*' ? 'inserted.*' : projectInserted(this.projection);
    const isReturning = this.projection !== '*' || this.terminalKind !== 'list';
    if (isReturning) {
      return `INSERT INTO [${this.table}] (${cols.map((c) => `[${c}]`).join(', ')}) OUTPUT ${inserted} VALUES ${valSqls.join(', ')}`;
    }
    return `INSERT INTO [${this.table}] (${cols.map((c) => `[${c}]`).join(', ')}) VALUES ${valSqls.join(', ')}`;
  }

  private buildUpdate(params: Record<string, unknown>): string {
    const cols = Object.keys(this.patch!);
    const sets = cols.map((c, i) => {
      const p = `s_${i}_${c}`;
      params[p] = this.patch![c];
      return `[${c}] = @${p}`;
    });
    const where = this.buildWhere(params);
    const inserted = this.projection === '*' ? 'inserted.*' : projectInserted(this.projection);
    return `UPDATE [${this.table}] SET ${sets.join(', ')} OUTPUT ${inserted}${where}`;
  }

  private buildDelete(params: Record<string, unknown>): string {
    const where = this.buildWhere(params);
    const inserted = this.projection === '*' ? 'deleted.*' : projectInserted(this.projection, 'deleted');
    return `DELETE FROM [${this.table}] OUTPUT ${inserted}${where}`;
  }

  private buildWhere(params: Record<string, unknown>): string {
    const parts: string[] = [];
    this.filters.forEach((f, i) => {
      if (f.op === 'IS NULL') return parts.push(`[${f.col}] IS NULL`);
      if (f.op === 'IS NOT NULL') return parts.push(`[${f.col}] IS NOT NULL`);
      if (f.op === 'IN') {
        const arr = (f.value as unknown[]) ?? [];
        if (arr.length === 0) return parts.push('1=0');
        const placeholders = arr.map((v, j) => {
          const p = `f_${i}_${j}`;
          params[p] = v;
          return `@${p}`;
        });
        return parts.push(`[${f.col}] IN (${placeholders.join(', ')})`);
      }
      const p = `f_${i}`;
      params[p] = f.value;
      parts.push(`[${f.col}] ${f.op} @${p}`);
    });
    if (this.rawOr) {
      parts.push('(' + parseOrFilter(this.rawOr, params) + ')');
    }
    return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
  }
}

function projectInserted(projection: string, prefix = 'inserted'): string {
  return projection
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((c) => `${prefix}.[${c}]`)
    .join(', ');
}

// Supabase OR strings look like: "first_name_ar.ilike.%foo%,family.eq.x"
function parseOrFilter(s: string, params: Record<string, unknown>): string {
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const sql = parts.map((part, i) => {
    const m = /^([a-zA-Z0-9_]+)\.(eq|lt|gt|lte|gte|like|ilike)\.(.*)$/i.exec(part);
    if (!m) return '1=0';
    const [, col, op, raw] = m;
    const p = `or_${i}`;
    params[p] = raw;
    const opSql = op === 'eq' ? '=' : op === 'lt' ? '<' : op === 'gt' ? '>' : op === 'lte' ? '<=' : op === 'gte' ? '>=' : 'LIKE';
    return `[${col}] ${opSql} @${p}`;
  });
  return sql.join(' OR ');
}

function bindParams(req: mssql.Request, params: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) {
      req.input(k, null);
    } else {
      req.input(k, v);
    }
  }
}

// -------------------------------------------------------------------------
// Top-level client used by SupabaseService:
//   client.from('t')...  client.rpc(name, args)
// -------------------------------------------------------------------------
// Result of an RPC call. Awaitable (returns the auto-shaped data — scalar
// for single-column single-row, object for single-row multi-column, array
// otherwise), with `.single()` / `.maybeSingle()` to force shapes.
class RpcQuery<T = AnyRow> implements PromiseLike<QueryResult<T>> {
  private terminalKind: 'auto' | 'single' | 'maybeSingle' = 'auto';

  constructor(
    private readonly pool: () => Promise<mssql.ConnectionPool>,
    private readonly name: string,
    private readonly args: Record<string, unknown>,
  ) {}

  single(): this { this.terminalKind = 'single'; return this; }
  maybeSingle(): this { this.terminalKind = 'maybeSingle'; return this; }

  then<R1, R2 = never>(
    onFulfilled?: ((v: QueryResult<T>) => R1 | PromiseLike<R1>) | undefined | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | undefined | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onFulfilled, onRejected);
  }

  private async execute(): Promise<QueryResult<T>> {
    try {
      const pool = await this.pool();
      const req = pool.request();
      for (const [k, v] of Object.entries(this.args)) {
        req.input(k, v as never);
      }
      const result = await req.execute(this.name);
      const rows = ((result.recordset ?? []) as Record<string, unknown>[]).map(toJsonReadable);

      if (this.terminalKind === 'single') {
        if (rows.length === 0) return { data: null as unknown as T, error: { message: 'No rows (single)' } };
        return { data: rows[0] as unknown as T, error: null };
      }
      if (this.terminalKind === 'maybeSingle') {
        return { data: (rows[0] ?? null) as unknown as T, error: null };
      }
      // Auto-shape: scalar / row / array.
      if (rows.length === 1) {
        const keys = Object.keys(rows[0]);
        if (keys.length === 1) return { data: rows[0][keys[0]] as unknown as T, error: null };
        return { data: rows[0] as unknown as T, error: null };
      }
      const data = rows.length === 0 ? null : (rows as unknown as T);
      return { data: data as T, error: null };
    } catch (e) {
      return { data: null as unknown as T, error: mapErr(e) };
    }
  }
}

export class MsSqlClient {
  constructor(private readonly pool: () => Promise<mssql.ConnectionPool>) {}

  from<T = AnyRow>(table: string): TableQuery<T> {
    return new TableQuery<T>(this.pool, table);
  }

  rpc<T = AnyRow>(name: string, args: Record<string, unknown> = {}): RpcQuery<T> {
    return new RpcQuery<T>(this.pool, name, args);
  }
}
