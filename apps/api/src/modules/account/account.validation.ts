import { z } from "zod";

export const depositSchema = z.object({
  account_id: z.string().min(1),
  amount: z.number().positive().finite(),
});

export type DepositData = z.infer<typeof depositSchema>;
