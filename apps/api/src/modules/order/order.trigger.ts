import { fillExistingOrder, getOpenLimitOrders } from "./order.service";
import { childLogger } from "../../lib/logger";

const log = childLogger("order.trigger");

/**
 * One sweep over resting limit orders. Each order whose limit has crossed
 * the live price is filled (fully or partially) in its own transaction.
 */
export async function runTriggerTick(): Promise<void> {
  try {
    const openOrders = await getOpenLimitOrders();
    if (openOrders.length === 0) return;
    log.info({ open: openOrders.length }, "trigger sweep");
    for (const order of openOrders) {
      try {
        await fillExistingOrder(order.id);
      } catch (e) {
        log.error({ orderId: order.id, err: String(e) }, "trigger fill failed");
      }
    }
  } catch (e) {
    log.error({ err: String(e) }, "trigger tick error");
  }
}

let started = false;

/** Start the limit-order matching loop. Idempotent. */
export function startOrderTriggerLoop(intervalMs = 3000): NodeJS.Timeout | null {
  if (started) return null;
  started = true;
  void runTriggerTick();
  const timer = setInterval(runTriggerTick, intervalMs);
  timer.unref?.();
  return timer;
}