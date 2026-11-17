export { prisma, shim } from "./client.js";
export {
  supabase,
  supabasePublic,
  checkSupabase,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY,
} from "./supabase.js";

/**
 * Lightweight type surface kept stable after removing the generated Prisma
 * client. Runtime code only needs `prisma` (typed `any` via the shim); these
 * types exist for the few `import type` sites in the API and seed scripts.
 */
export type User = {
  id: string;
  auth_id: string | null;
  email: string;
  username: string;
  password_hash: string | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export type Agent = {
  id: string;
  user_id: string;
  name: string;
  api_key_hash: string | null;
  is_active: boolean;
  description: string;
  model: string;
  strategy: string;
  created_at: Date;
  updated_at: Date;
};

export type Account = Record<string, any>;
export type Stocks = Record<string, any>;
export type Holdings = Record<string, any>;
export type Orders = Record<string, any>;
export type Trades = Record<string, any>;
export type CashLedger = Record<string, any>;
export type PriceHistory = Record<string, any>;

export namespace Prisma {
  export type StocksCreateManyInput = Record<string, any>;
  export type UserCreateInput = Record<string, any>;
  export type AccountCreateInput = Record<string, any>;
  export type AgentCreateInput = Record<string, any>;
  export type OrdersCreateInput = Record<string, any>;
  export type CashLedgerCreateInput = Record<string, any>;
  export type HoldingsCreateInput = Record<string, any>;
  export type TradesCreateInput = Record<string, any>;
}
