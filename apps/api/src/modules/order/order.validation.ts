import { z } from "zod";

export const orderRequestSchema = z
  .object({
    account_id: z.string().min(1),
    symbol: z.string().min(1).transform((s) => s.toUpperCase()),
    side: z.enum(["BUY", "SELL"]),
    type: z.enum(["LIMIT", "MARKET"]),
    qty: z.number().positive().finite(),
    limit_price: z.number().positive().finite().optional(),
  })
  .refine(
    (d) => d.type !== "LIMIT" || d.limit_price !== undefined,
    { message: "limit_price is required for LIMIT orders", path: ["limit_price"] }
  );

export type OrderRequest = z.infer<typeof orderRequestSchema>;
