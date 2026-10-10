import type { NextFunction, Request, Response } from "express";
import { prisma } from "@project-eryx/db";
import { DEFAULT_INITIAL_CAPITAL } from "../../lib/constants";

/**
 * Identity lives in the shared auth service (better-auth). The browser holds
 * the `.shrijit.tech` session cookie, so the API never mints a token: it
 * replays that cookie to get-session and keys every request off the auth id.
 */
const AUTH_URL = process.env.AUTH_URL ?? "https://auth.shrijit.tech";
const SESSION_COOKIE = "better-auth.session_token=";
const CACHE_MS = 5_000;

interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

let cache: { cookie: string; userId: string; at: number } | null = null;

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
  await prisma.$transaction(async (tx) => {
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

async function userIdForCookie(cookie: string): Promise<string | null> {
  if (cache && cache.cookie === cookie && Date.now() - cache.at < CACHE_MS) {
    return cache.userId;
  }
  const res = await fetch(`${AUTH_URL}/api/auth/get-session`, {
    headers: { cookie },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { user?: AuthUser } | null;
  if (!body?.user?.id) return null;

  const userId = await upsertUser(body.user);
  cache = { cookie, userId, at: Date.now() };
  return userId;
}

const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const cookie = req.headers.cookie;
  if (!cookie || !cookie.includes(SESSION_COOKIE)) {
    return res.status(401).json({ message: "Sign in to continue." });
  }

  let userId: string | null;
  try {
    userId = await userIdForCookie(cookie);
  } catch (err) {
    console.error("[auth] shared auth service unreachable", err);
    return res.status(503).json({ message: "Authentication service unavailable." });
  }

  if (!userId) return res.status(401).json({ message: "Session expired. Sign in again." });
  req.user = { userId };
  next();
};

export default authenticateToken;