/**
 * Concurrency load test for the order execution path.
 *
 * Fires N concurrent MARKET orders at a single account and then asserts the
 * strongest correctness invariant we have: after all orders land, the account's
 * cash still reconciles against its immutable CashLedger, and the holdings
 * count matches the number of fills. This exercises the FOR UPDATE row-lock
 * serialization that is the #1 risk class per AGENTS.md.
 *
 * Run:  bun tests/load-test.ts
 */
const BASE = process.env.API_URL || "http://localhost:8080";
const SYMBOL = "AAPL";
const CONCURRENCY = Number(process.env.LOAD || 25);

async function j(url: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${url}`, init);
  return res.json();
}

async function main() {
  const stamp = Date.now();
  const email = `load_${stamp}@test.com`;

  await j("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", username: `load_${stamp}` }),
  });
  const login = await j("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  const token: string = login.token;
  const accts = await j("/api/account", { headers: { Authorization: `Bearer ${token}` } });
  const accountId: string = accts.data[0].id;
  const initialCash: number = accts.data[0].cash_balance;

  console.log(`Firing ${CONCURRENCY} concurrent BUY x1 ${SYMBOL} on ${accountId}`);

  const t0 = performance.now();
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      fetch(`${BASE}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          account_id: accountId,
          symbol: SYMBOL,
          side: "BUY",
          type: "MARKET",
          qty: 1,
        }),
      }).then((r) => r.status)
    )
  );
  const elapsed = Math.round(performance.now() - t0);

  const filled = results.filter((s) => s === 201).length;
  const detail = await j(`/api/account/${accountId}`, { headers: { Authorization: `Bearer ${token}` } });
  const pos = detail.data.positions.find((p: any) => p.symbol === SYMBOL);
  const held = pos?.quantity ?? 0;
  const cash = detail.data.cash_balance;
  const cost = Math.round((initialCash - cash) * 100) / 100;

  const recon = await j("/api/admin/reconcile");
  const thisMismatch = recon.data.mismatches.find((m: any) => m.account_id === accountId);

  const report = {
    concurrency: CONCURRENCY,
    elapsed_ms: elapsed,
    http_201: filled,
    http_other: results.length - filled,
    holdings_after: held,
    cash_spent: cost,
    ledger_reconciles: recon.data.ok && !thisMismatch,
    expected_holds_everything: filled === CONCURRENCY && held === CONCURRENCY,
    PASS: filled === CONCURRENCY && held === CONCURRENCY && !thisMismatch,
  };
  console.log(JSON.stringify(report, null, 2));

  if (!report.PASS) {
    console.error("LOAD TEST FAILED — see report above.");
    process.exit(1);
  }
  console.log("LOAD TEST PASSED: all concurrent orders filled, holdings correct, ledger reconciles.");
}

main().catch((e) => {
  console.error("load test error:", e);
  process.exit(1);
});
