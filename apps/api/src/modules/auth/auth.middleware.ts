import type { NextFunction, Request, Response } from "express";
import { prisma } from "@project-eryx/db";
import { supabase } from "../../lib/supabase";
import { DEFAULT_INITIAL_CAPITAL } from "../../lib/constants";

/**
 * Identity is owned by Supabase Auth (GoTrue) in the shared fleet project.
 * The API never mints a token: it validates the caller's Supabase access token
 * with `auth.getUser(token)` (Bearer header or replayed auth cookie) and keys
 * every request off that immutable auth id.
 */
const CACHE_MS = 5_000;

interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

let cache: { token: string; userId: string; at: number } | null = null;

function metaString(user: any, key: string): string {
  const value = user?.user_metadata?.[key];
  return typeof value === "string" ? value : "";
}

/** Extract a Supabase access token from the standard Bearer header. */
function tokenFromHeader(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  return null;
}

/**
 * Fall back to a Supabase auth cookie. Browsers either send the raw token
 * (`sb-access-token`) or the JSON session object (`sb-<ref>-auth-token`) that
 * Supabase SSR stores.
 */
function tokenFromCookies(header: string | undefined): string | null {
  if (!header) return null;
  const cookies = new Map<string, string>();
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    cookies.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
  }
  for (const name of ["sb-access-token", "supabase-access-token", "access_token"]) {
    const value = cookies.get(name);
    if (value && value.startsWith("eyJ")) return value;
  }
  for (const [name, value] of cookies) {
    if (!name.includes("auth-token")) continue;
    try {
      const parsed = JSON.parse(value) as { access_token?: string };
      if (parsed?.access_token) return parsed.access_token;
    } catch {
      /* not a JSON session cookie */
    }
  }
  return null;
}

async function freeUsername(preferred: string): Promise<string> {
  const base =
    preferred
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "trader";
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 22)}_${i + 1}`;
    if (!(await prisma.user.findUnique({ where: { username: candidate } }))) {
      return candidate;
    }
  }
  return `${base}_${Date.now().toString(36)}`;
}

/** First authenticated request provisions the local user + funded account. */
async function upsertUser(authUser: AuthUser): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { auth_id: authUser.id },
  });
  if (existing) return existing.id;

  const user = await prisma.user.create({
    data: {
      auth_id: authUser.id,
      email: authUser.email,
      username: await freeUsername(
        authUser.name || (authUser.email.split("@")[0] ?? authUser.email),
      ),
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  // Same provisioning the old /api/auth/register did: a funded paper account
  // plus its immutable DEPOSIT ledger row, so leaderboard P&L still computes
  // as equity - initial deposits.
  await prisma.$transaction(async (tx: any) => {
    const account = await tx.account.create({
      data: {
        user_id: user.id,
        account_type: "USER",
        cash_balance: DEFAULT_INITIAL_CAPITAL,
        blocked_cash: 0,
        currency: "USD",
        status: "ACTIVE",
      },
    });
    await tx.cashLedger.create({
      data: {
        account_id: account.id,
        type: "DEPOSIT",
        amount: DEFAULT_INITIAL_CAPITAL,
        balance_after: DEFAULT_INITIAL_CAPITAL,
        reference_id: `initial-${user.id}`,
        description: "Initial paper-trading capital",
        created_at: new Date(),
      },
    });
  });

  return user.id;
}

async function userIdForToken(token: string): Promise<string | null> {
  if (cache && cache.token === token && Date.now() - cache.at < CACHE_MS) {
    return cache.userId;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const supabaseUser = data.user;
  const authUser: AuthUser = {
    id: supabaseUser.id,
    email: supabaseUser.email ?? "",
    name:
      metaString(supabaseUser, "full_name") ||
      metaString(supabaseUser, "name") ||
      supabaseUser.email?.split("@")[0] ||
      "trader",
  };
  const userId = await upsertUser(authUser);
  cache = { token, userId, at: Date.now() };
  return userId;
}

const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = tokenFromHeader(req) ?? tokenFromCookies(req.headers.cookie);
  if (!token) {
    return res.status(401).json({ message: "Sign in to continue." });
  }

  let userId: string | null;
  try {
    userId = await userIdForToken(token);
  } catch (err) {
    console.error("[auth] supabase auth check failed", err);
    return res.status(503).json({ message: "Authentication service unavailable." });
  }

  if (!userId) return res.status(401).json({ message: "Session expired. Sign in again." });
  req.user = { userId };
  next();
};

export default authenticateToken;
