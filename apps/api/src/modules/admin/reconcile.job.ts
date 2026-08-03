import { reconcileLedgers } from "./reconcile";
import { getRedis } from "../../lib/redis";
import { childLogger } from "../../lib/logger";

const log = childLogger("reconcile.job");

/**
 * Periodic immutable-ledger reconciliation. Runs in the background and flags
 * any drift between cash balances and ledger sums.
 */
export async function scheduleReconcile(intervalMs = 15 * 60_000): Promise<NodeJS.Timeout> {
  const run = async () => {
    try {
      const result = await reconcileLedgers();
      await getRedis().set("admin:reconcile:latest", JSON.stringify(result), "EX", 3600);
      if (result.ok) {
        log.info({ checked: result.accounts_checked }, "ledger reconciliation OK");
      } else {
        log.error(
          { mismatches: result.mismatches.length, checked: result.accounts_checked },
          "ledger reconciliation MISMATCH"
        );
      }
    } catch (e) {
      log.error({ err: String(e) }, "reconcile job failed");
    }
  };
  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}