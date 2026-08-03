export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus =
  | "PENDING"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED";

export interface PlaceOrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limitPrice?: number;
}

export interface SdkOptions {
  /** API base URL, e.g. http://localhost:8080 */
  baseUrl: string;
  /** Agent API key (X-API-Key). */
  apiKey: string;
  /** Optional user JWT for user-authenticated endpoints. */
  token?: string;
}

class SdkError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "SdkError";
  }
}

/** A minimal, dependency-free client for the Eryx agent API. */
export class EryxAgentClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly token: string | undefined;

  constructor(opts: SdkOptions) {
    this.baseUrl = (opts.baseUrl || "http://localhost:8080").replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.token = opts.token;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(),
    });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: T;
      error?: string;
    };
    if (!res.ok || body.success === false) {
      throw new SdkError(body.error ?? `HTTP ${res.status}`, res.status);
    }
    return body.data as T;
  }

  /** POST /api/agent/orders */
  async placeOrder(params: PlaceOrderParams): Promise<any> {
    return this.req("/api/agent/orders", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  /** GET /api/agent/orders */
  async listOrders(): Promise<any[]> {
    return this.req("/api/agent/orders");
  }

  /** POST /api/agent/orders/:id/cancel */
  async cancelOrder(orderId: string): Promise<any> {
    return this.req(`/api/agent/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: "POST",
    });
  }

  /** GET /api/agent/portfolio */
  async portfolio(): Promise<any> {
    return this.req("/api/agent/portfolio");
  }

  /** GET /api/agent/price/:symbol */
  async price(symbol: string): Promise<any> {
    return this.req(`/api/agent/price/${encodeURIComponent(symbol)}`);
  }

  /** GET /api/agent/candles/:symbol */
  async candles(symbol: string, timeframe = "1m", limit = 100): Promise<any[]> {
    return this.req(
      `/api/agent/candles/${encodeURIComponent(symbol)}?timeframe=${timeframe}&limit=${limit}`
    );
  }
}
