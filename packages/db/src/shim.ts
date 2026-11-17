import crypto from "node:crypto";
import { supabase } from "./supabase.js";

/** Loosely-typed handle: avoids deep generic inference from the PostgREST builder. */
const db: any = supabase;

/**
 * Prisma-shaped compatibility shim backed by Supabase PostgREST.
 *
 * Project Eryx's route/services were written against Prisma. A service-role
 * Supabase client cannot open a raw Postgres connection from Coolify, so this
 * module translates the small, well-defined subset of the Prisma query API the
 * API actually uses (findUnique/findFirst/findMany/create/createMany/update/
 * upsert/groupBy/$transaction/$queryRaw) into PostgREST calls over HTTPS.
 *
 * Route signatures and result shapes stay stable. Two documented differences
 * from real Prisma:
 *   - `$transaction` runs its callback sequentially on the same client. A
 *     single PostgREST request is atomic, but a multi-request callback is not
 *     wrapped in one SQL transaction (PostgREST cannot do cross-request tx).
 *   - `$queryRaw ... FOR UPDATE` is served as a plain SELECT (no row lock).
 *
 * Supabase table names are prefixed `eryx_*` to avoid collisions with the
 * fleet-wide `users`, `organizations`, `boards`, etc. tables already present
 * in the shared fleet project.
 */

type Dict = Record<string, any>;

/** Prisma model key -> physical Supabase table. */
export const TABLES: Dict = {
  user: "eryx_users",
  agent: "eryx_agents",
  account: "eryx_accounts",
  stocks: "eryx_stocks",
  holdings: "eryx_holdings",
  orders: "eryx_orders",
  trades: "eryx_trades",
  cashLedger: "eryx_cash_ledger",
  priceHistory: "eryx_price_history",
};

/** Quoted Prisma model name used in $queryRaw -> physical table. */
const RAW_TABLES: Dict = {
  User: TABLES.user,
  Agent: TABLES.agent,
  Account: TABLES.account,
  Stocks: TABLES.stocks,
  Holdings: TABLES.holdings,
  Orders: TABLES.orders,
  Trades: TABLES.trades,
  CashLedger: TABLES.cashLedger,
  PriceHistory: TABLES.priceHistory,
};

/** Columns that must come back as JS Date objects (Prisma DateTime semantics). */
const DATE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "timestamp",
  "executed_at",
  "listing_date",
  "last_price_update",
]);

const OPS = new Set(["gt", "gte", "lt", "lte", "in", "notIn", "contains", "startsWith", "endsWith", "equals", "not", "mode"]);

/** Relation metadata: how to join a model's relation to another table. */
const RELATIONS: Dict = {
  user: {
    account: { model: "account", parentKey: "id", foreignKey: "user_id", type: "one" },
    agent: { model: "agent", parentKey: "id", foreignKey: "user_id", type: "many" },
  },
  agent: {
    user: { model: "user", parentKey: "user_id", foreignKey: "id", type: "one" },
    accounts: { model: "account", parentKey: "id", foreignKey: "agent_id", type: "many" },
  },
  account: {
    user: { model: "user", parentKey: "user_id", foreignKey: "id", type: "one" },
    agent: { model: "agent", parentKey: "agent_id", foreignKey: "id", type: "one" },
    holdings: { model: "holdings", parentKey: "id", foreignKey: "account_id", type: "many" },
    order: { model: "orders", parentKey: "id", foreignKey: "account_id", type: "many" },
    cashLedgers: { model: "cashLedger", parentKey: "id", foreignKey: "account_id", type: "many" },
    trades: { model: "trades", parentKey: "id", foreignKey: "account_id", type: "many" },
  },
  stocks: {
    holdings: { model: "holdings", parentKey: "id", foreignKey: "stock_id", type: "many" },
    orders: { model: "orders", parentKey: "id", foreignKey: "stock_id", type: "many" },
    trades: { model: "trades", parentKey: "id", foreignKey: "stock_id", type: "many" },
    priceHistory: { model: "priceHistory", parentKey: "id", foreignKey: "stock_id", type: "many" },
  },
  holdings: {
    account: { model: "account", parentKey: "account_id", foreignKey: "id", type: "one" },
    stock: { model: "stocks", parentKey: "stock_id", foreignKey: "id", type: "one" },
  },
  orders: {
    account: { model: "account", parentKey: "account_id", foreignKey: "id", type: "one" },
    stock: { model: "stocks", parentKey: "stock_id", foreignKey: "id", type: "one" },
    buyTrades: { model: "trades", parentKey: "id", foreignKey: "buy_order_id", type: "many" },
    sellTrades: { model: "trades", parentKey: "id", foreignKey: "sell_order_id", type: "many" },
  },
  trades: {
    account: { model: "account", parentKey: "account_id", foreignKey: "id", type: "one" },
    stock: { model: "stocks", parentKey: "stock_id", foreignKey: "id", type: "one" },
    buy_order: { model: "orders", parentKey: "buy_order_id", foreignKey: "id", type: "one" },
    sell_order: { model: "orders", parentKey: "sell_order_id", foreignKey: "id", type: "one" },
  },
  cashLedger: {
    account: { model: "account", parentKey: "account_id", foreignKey: "id", type: "one" },
  },
  priceHistory: {
    stock: { model: "stocks", parentKey: "stock_id", foreignKey: "id", type: "one" },
  },
};

// ---------------------------------------------------------------------------
// value / row helpers
// ---------------------------------------------------------------------------

function toFilterValue(value: any): any {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function formatOrValue(value: any): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const s = toFilterValue(value);
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

/** Build a single PostgREST condition string for use inside `.or(...)`. */
function conditionString(field: string, cond: any): string {
  if (cond === null || cond === undefined) return `${field}.is.null`;
  if (cond instanceof Date || typeof cond !== "object") {
    return `${field}.eq.${formatOrValue(cond)}`;
  }
  if (Array.isArray(cond)) return `${field}.in.(${cond.map(formatOrValue).join(",")})`;
  const parts: string[] = [];
  for (const [op, val] of Object.entries(cond)) {
    if (op === "in" && Array.isArray(val)) {
      // PostgREST rejects `field.in.()` — an empty set matches nothing.
      parts.push(val.length ? `${field}.in.(${val.map(formatOrValue).join(",")})` : `${field}.is.null`);
    } else if (op === "notIn" && Array.isArray(val)) {
      parts.push(`${field}.not.in.(${val.map(formatOrValue).join(",")})`);
    } else if (op === "equals") {
      parts.push(`${field}.eq.${formatOrValue(val)}`);
    } else if (op === "contains" && typeof val === "string") {
      parts.push(`${field}.like.%${val}%`);
    } else if (OPS.has(op)) {
      parts.push(`${field}.${op}.${formatOrValue(val)}`);
    }
  }
  return parts.join(",");
}

/** Apply a normalized where-clause to a PostgREST query builder. */
function applyWhere(query: any, where: Dict | undefined | null): any {
  if (!where) return query;
  for (const [field, cond] of Object.entries(where)) {
    if (field === "OR" && Array.isArray(cond)) {
      const parts = cond
        .map((branch: Dict) =>
          Object.entries(branch)
            .map(([k, v]) => conditionString(k, v))
            .join(","),
        )
        .filter(Boolean)
        .map((s: string) => `(${s})`);
      if (parts.length) query = query.or(parts.join(","));
      continue;
    }
    if (field === "AND" && Array.isArray(cond)) {
      for (const branch of cond) query = applyWhere(query, branch);
      continue;
    }
    if (cond === null || cond === undefined) {
      query = query.is(field, null);
    } else if (cond instanceof Date || typeof cond !== "object") {
      query = query.eq(field, toFilterValue(cond));
    } else if (Array.isArray(cond)) {
      query = query.in(field, cond.map(toFilterValue));
    } else {
      for (const [op, val] of Object.entries(cond)) {
        if (op === "in" && Array.isArray(val)) {
          query = val.length ? query.in(field, val.map(toFilterValue)) : query.is(field, null);
        }
        else if (op === "notIn" && Array.isArray(val)) query = query.not(field, "in", `(${val.join(",")})`);
        else if (op === "equals") query = query.eq(field, toFilterValue(val));
        else if (op === "contains" && typeof val === "string") query = query.like(field, `%${val}%`);
        else if (op === "startsWith" && typeof val === "string") query = query.like(field, `${val}%`);
        else if (OPS.has(op)) query = query[op](field, toFilterValue(val));
      }
    }
  }
  return query;
}

/** Resolve a relation-shaped where value (e.g. `agent: { user_id }`) to an FK `in` filter. */
async function resolveRelation(model: string, key: string, cond: any): Promise<Dict | null> {
  const rel = RELATIONS[model]?.[key];
  if (!rel || !cond || typeof cond !== "object") return null;
  let query: any = db.from(TABLES[rel.model]).select(rel.foreignKey);
  query = applyWhere(query, cond);
  const { data, error } = await query;
  if (error) throw error;
  const values = (data ?? []).map((r: Dict) => r[rel.foreignKey]).filter((v: any) => v !== null && v !== undefined);
  return { [rel.parentKey]: { in: values } };
}

/**
 * Normalize a Prisma where-clause into scalar PostgREST conditions, resolving
 * relation filters and compound-unique objects into concrete column filters.
 */
async function normalizeWhere(model: string, where: Dict | undefined | null): Promise<Dict> {
  if (!where) return {};
  const out: Dict = {};
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    if ((key === "OR" || key === "AND") && Array.isArray(value)) {
      out[key] = await Promise.all(value.map((branch: Dict) => normalizeWhere(model, branch)));
      continue;
    }
    const isOperatorObject =
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Array.isArray(value) &&
      Object.keys(value).some((k) => OPS.has(k));
    if (isOperatorObject) {
      out[key] = value;
      continue;
    }
    // compound unique, e.g. account_id_stock_id: { account_id, stock_id }
    if (
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Array.isArray(value) &&
      !RELATIONS[model]?.[key]
    ) {
      Object.assign(out, await normalizeWhere(model, value));
      continue;
    }
    if (RELATIONS[model]?.[key]) {
      const resolved = await resolveRelation(model, key, value);
      if (resolved) Object.assign(out, resolved);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function normalizeRow(row: Dict | null): Dict | null {
  if (!row) return row;
  const out: Dict = {};
  for (const [key, value] of Object.entries(row)) {
    if (DATE_COLUMNS.has(key) && typeof value === "string") {
      const date = new Date(value);
      out[key] = Number.isNaN(date.getTime()) ? value : date;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function normalizeRows(rows: Dict[] | null | undefined): Dict[] {
  return (rows ?? []).map((row) => normalizeRow(row)!);
}

function selectColumns(select: any): string {
  if (typeof select === "string") return select;
  if (!select || typeof select !== "object") return "*";
  const columns = Object.entries(select)
    .filter(([, include]) => include)
    .map(([column]) => column);
  return columns.length ? columns.join(",") : "*";
}

/** Make a write payload safe for JSON/PostgREST. */
function prepareData(data: Dict, generateId = true): Dict {
  const row: Dict = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined) continue;
    row[key] = value instanceof Date ? value.toISOString() : value;
  }
  // Only inserts need a generated primary key. Never rewrite `id` on UPDATE.
  if (generateId && !row.id) row.id = crypto.randomUUID();
  return row;
}

async function applyIncludes(model: string, rows: Dict[], includes: Dict | undefined): Promise<Dict[]> {
  if (!includes || !rows.length) return rows;
  for (const [key, option] of Object.entries(includes)) {
    const rel = RELATIONS[model]?.[key];
    if (!rel) continue;
    const config: Dict = typeof option === "boolean" ? {} : (option ?? {});
    const parentValues = rows
      .map((row) => row[rel.parentKey])
      .filter((value) => value !== null && value !== undefined);
    if (!parentValues.length) {
      rows.forEach((row) => (row[key] = rel.type === "many" ? [] : null));
      continue;
    }
    let query: any = db.from(TABLES[rel.model]);
    query = query.select(config.select ? selectColumns(config.select) : "*");
    query = query.in(rel.foreignKey, [...new Set(parentValues)]);
    if (config.where) query = applyWhere(query, await normalizeWhere(rel.model, config.where));
    if (config.orderBy) {
      for (const [column, direction] of Object.entries(config.orderBy as Dict)) {
        query = query.order(column, { ascending: String(direction).toLowerCase() === "asc" });
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    const children = normalizeRows(data);
    if (config.include) await applyIncludes(rel.model, children, config.include);
    const grouped = new Map<any, any>();
    for (const child of children) {
      const fk = child[rel.foreignKey];
      if (rel.type === "many") {
        if (!grouped.has(fk)) grouped.set(fk, []);
        grouped.get(fk).push(child);
      } else {
        grouped.set(fk, child);
      }
    }
    for (const row of rows) {
      row[key] = rel.type === "many" ? (grouped.get(row[rel.parentKey]) ?? []) : (grouped.get(row[rel.parentKey]) ?? null);
    }
  }
  return rows;
}

async function runQuery(model: string, args: Dict = {}): Promise<Dict[]> {
  const where = await normalizeWhere(model, args.where);
  let query: any = db.from(TABLES[model]).select(args.select ? selectColumns(args.select) : "*");
  query = applyWhere(query, where);
  if (args.orderBy) {
    for (const [column, direction] of Object.entries(args.orderBy as Dict)) {
      query = query.order(column, { ascending: String(direction).toLowerCase() === "asc" });
    }
  }
  if (args.skip) query = query.range(args.skip, args.skip + (args.take ?? 1000) - 1);
  else if (args.take !== undefined) query = query.range(0, args.take - 1);
  const { data, error } = await query;
  if (error) throw error;
  const rows = normalizeRows(data);
  if (args.include) await applyIncludes(model, rows, args.include);
  return rows;
}

// ---------------------------------------------------------------------------
// model factory
// ---------------------------------------------------------------------------

function makeModel(model: string): Dict {
  const findMany = (args: Dict = {}) => runQuery(model, args);

  const findFirst = async (args: Dict = {}) => {
    const rows = await runQuery(model, { ...args, take: 1 });
    return rows[0] ?? null;
  };

  const findUnique = async (args: Dict = {}) => findFirst(args);

  const create = async (args: Dict) => {
    const { data, error } = await supabase
      .from(TABLES[model])
      .insert(prepareData(args.data ?? {}))
      .select("*")
      .single();
    if (error) throw error;
    const row = normalizeRow(data)!;
    if (args.include) await applyIncludes(model, [row], args.include);
    return row;
  };

  const createMany = async (args: Dict) => {
    const rows = (Array.isArray(args.data) ? args.data : [args.data]).map((row) => prepareData(row));
    if (!rows.length) return { count: 0 };
    const { data, error } = await db.from(TABLES[model]).insert(rows).select("id");
    if (error) throw error;
    return { count: data?.length ?? 0 };
  };

  const update = async (args: Dict) => {
    const where = await normalizeWhere(model, args.where);
    let query: any = db.from(TABLES[model]).update(prepareData(args.data ?? {}, false));
    query = applyWhere(query, where);
    const { data, error } = await query.select("*").single();
    if (error) throw error;
    const row = normalizeRow(data)!;
    if (args.include) await applyIncludes(model, [row], args.include);
    return row;
  };

  const upsert = async (args: Dict) => {
    const existing = await findFirst({ where: args.where });
    if (existing) return update({ where: { id: existing.id }, data: args.update });
    const keyFields = await normalizeWhere(model, args.where);
    return create({ data: { ...keyFields, ...(args.create ?? {}) } });
  };

  const deleteMany = async (args: Dict = {}) => {
    const where = await normalizeWhere(model, args.where);
    let query: any = db.from(TABLES[model]).delete();
    query = applyWhere(query, where);
    const { data, error } = await query.select("id");
    if (error) throw error;
    return { count: data?.length ?? 0 };
  };

  const groupBy = async (args: Dict) => {
    const by: string[] = args.by ?? [];
    const sums: Dict = args._sum ?? {};
    const columns = [...new Set([...by, ...Object.keys(sums)])].join(",");
    const where = await normalizeWhere(model, args.where);
    let query: any = db.from(TABLES[model]).select(columns);
    query = applyWhere(query, where);
    const { data, error } = await query;
    if (error) throw error;
    const groups = new Map<string, Dict>();
    for (const row of (data ?? []) as Dict[]) {
      const key = JSON.stringify(by.map((column) => row[column]));
      if (!groups.has(key)) {
        const group: Dict = {};
        for (const column of by) group[column] = row[column];
        if (Object.keys(sums).length) group._sum = {};
        groups.set(key, group);
      }
      const group = groups.get(key)!;
      for (const field of Object.keys(sums)) {
        group._sum[field] = (group._sum[field] ?? 0) + Number(row[field] ?? 0);
      }
    }
    return [...groups.values()];
  };

  return { findUnique, findFirst, findMany, create, createMany, update, upsert, deleteMany, groupBy };
}

/** The Prisma-shaped client consumed by every API module via `@project-eryx/db`. */
export const shim: Dict & {
  $transaction: (fn: (tx: any) => Promise<any>) => Promise<any>;
  $queryRaw: (strings: TemplateStringsArray | string, ...values: any[]) => Promise<any[]>;
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
} = {
  user: makeModel("user"),
  agent: makeModel("agent"),
  account: makeModel("account"),
  stocks: makeModel("stocks"),
  holdings: makeModel("holdings"),
  orders: makeModel("orders"),
  trades: makeModel("trades"),
  cashLedger: makeModel("cashLedger"),
  priceHistory: makeModel("priceHistory"),

  /** PostgREST cannot wrap multiple HTTP requests in one SQL transaction. Run
   *  the callback sequentially on the same client so route behaviour is stable. */
  $transaction: (fn) => fn(shim),

  /** Translate the handful of raw queries the execution engine uses. */
  $queryRaw: async (strings, ...values) => {
    const text = Array.isArray(strings) ? strings.join("?") : String(strings);
    const match = text.match(/SELECT\s+\*\s+FROM\s+"?(\w+)"?\s+WHERE\s+id\s*=\s*\?/i);
    if (match) {
      const rawName = match[1] as string;
      const table = RAW_TABLES[rawName] ?? TABLES[rawName];
      if (table) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq("id", values[0])
          .limit(1);
        if (error) throw error;
        return normalizeRows(data);
      }
    }
    if (/select\s+1/i.test(text)) {
      // Keep the old `SELECT 1` health idiom meaningful: actually probe the
      // Supabase gateway instead of returning a synthetic success row.
      const { error } = await db.from(TABLES.stocks).select("id").limit(1);
      if (error) throw error;
      return [{ "?column?": 1 }];
    }
    return [];
  },

  $connect: async () => {
    await db.from(TABLES.stocks).select("id").limit(1);
  },

  $disconnect: async () => {
    /* HTTP client — nothing to close */
  },
};
