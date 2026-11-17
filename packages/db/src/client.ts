import { shim } from "./shim.js";

/** Fluent model API mirrored from Prisma so route signatures stay unchanged. */
export interface PrismaModel {
  findUnique: (args?: any) => Promise<any>;
  findFirst: (args?: any) => Promise<any>;
  findMany: (args?: any) => Promise<any[]>;
  create: (args: any) => Promise<any>;
  createMany: (args: any) => Promise<{ count: number }>;
  update: (args: any) => Promise<any>;
  upsert: (args: any) => Promise<any>;
  deleteMany: (args?: any) => Promise<{ count: number }>;
  groupBy: (args: any) => Promise<any[]>;
}

/**
 * Concrete shape of the `prisma` export. The `Tx` type used across the
 * execution engine is derived from `$transaction`, so this must be a real
 * function type rather than `any` (which degenerates to `never`).
 */
export interface PrismaLike {
  user: PrismaModel;
  agent: PrismaModel;
  account: PrismaModel;
  stocks: PrismaModel;
  holdings: PrismaModel;
  orders: PrismaModel;
  trades: PrismaModel;
  cashLedger: PrismaModel;
  priceHistory: PrismaModel;
  $transaction: <T>(fn: (tx: PrismaLike) => Promise<T>) => Promise<T>;
  $queryRaw: (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
}

/**
 * Drop-in `prisma` export. This used to be a PrismaClient bound to a raw
 * Postgres connection; it is now the Supabase-backed compatibility shim so
 * every existing API route keeps its exact call signature and result shape.
 */
export const prisma: PrismaLike = shim as unknown as PrismaLike;

export { shim } from "./shim.js";
