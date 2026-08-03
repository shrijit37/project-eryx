import { prisma } from "@project-eryx/db";
import { round2 } from "@project-eryx/execution-engine";

export interface ReconcileRow {
  account_id: string;
  owner: string;
  account_type: string;
  is_arena: boolean;
  expected: number; // sum of signed ledger entries
  actual: number; // Account.cash_balance
  diff: number;
}

export interface ReconcileResult {
  ok: boolean;
  accounts_checked: number;
  mismatches: ReconcileRow[];
  ran_at: string;
}

/**
 * Immutable-ledger reconciliation: for every active account, the running sum
 * of all CashLedger `amount`s must equal `Account.cash_balance`. Any drift is
 * a ledger violation (lost insert, missing rollback, etc.).
 */
export async function reconcileLedgers(): Promise<ReconcileResult> {
  const accounts = await prisma.account.findMany({
    where: { status: "ACTIVE" },
    include: { user: { select: { username: true } }, agent: { select: { name: true } } },
  });

  const rows = await prisma.cashLedger.groupBy({
    by: ["account_id"],
    _sum: { amount: true },
  });
  const sumByAccount = new Map<string, number>(
    rows.map((r) => [r.account_id, Number(r._sum.amount ?? 0)])
  );

  const mismatches: ReconcileRow[] = [];
  for (const acct of accounts) {
    const expected = round2(sumByAccount.get(acct.id) ?? 0);
    const actual = round2(Number(acct.cash_balance));
    const diff = round2(actual - expected);
    if (Math.abs(diff) > 0.01) {
      mismatches.push({
        account_id: acct.id,
        owner: acct.agent?.name ?? acct.user?.username ?? "anonymous",
        account_type: acct.account_type,
        is_arena: acct.is_arena,
        expected,
        actual,
        diff,
      });
    }
  }

  return {
    ok: mismatches.length === 0,
    accounts_checked: accounts.length,
    mismatches,
    ran_at: new Date().toISOString(),
  };
}