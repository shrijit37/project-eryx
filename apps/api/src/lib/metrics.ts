/**
 * Lightweight in-process metrics for order flow (counters + fill latency).
 * A simple poll model — no external collector needed for a simulator.
 */

class Bucket {
  count = 0;
  totalMs = 0;
  min = Infinity;
  max = 0;
}

/** A sliding-window histogram of fill latencies (1-minute buckets). */
class LatencyHistogram {
  private buckets = new Map<number, Bucket>();
  private windowSeconds = 60 * 5; // 5 min
  private startMs = Date.now();

  observe(elapsedMs: number): void {
    if (Date.now() - this.startMs > this.windowSeconds * 1000) {
      this.buckets.clear();
      this.startMs = Date.now();
    }
    const key = Math.floor(Date.now() / 60_000);
    let b = this.buckets.get(key);
    if (!b) {
      b = new Bucket();
      this.buckets.set(key, b);
    }
    b.count++;
    b.totalMs += elapsedMs;
    b.min = Math.min(b.min, Math.max(elapsedMs, 0));
    b.max = Math.max(b.max, elapsedMs);
  }

  snapshot(): { requests: number; avgMs: number; minMs: number; maxMs: number } {
    let count = 0;
    let total = 0;
    let min = Infinity;
    let max = 0;
    for (const b of this.buckets.values()) {
      count += b.count;
      total += b.totalMs;
      min = Math.min(min, b.min);
      max = Math.max(max, b.max);
    }
    return {
      requests: count,
      avgMs: count > 0 ? Math.round(total / count) : 0,
      minMs: count > 0 ? Math.round(min) : 0,
      maxMs: Math.round(max),
    };
  }
}

class Metrics {
  private counters: Record<string, number> = {};
  private fillLatency = new LatencyHistogram();

  inc(name: string, by = 1): void {
    this.counters[name] = (this.counters[name] ?? 0) + by;
  }

  observeFillLatency(ms: number): void {
    this.fillLatency.observe(ms);
  }

  snapshot(): Record<string, unknown> {
    return {
      counters: { ...this.counters },
      fill_latency_ms: this.fillLatency.snapshot(),
      time: new Date().toISOString(),
    };
  }
}

export const metrics = new Metrics();