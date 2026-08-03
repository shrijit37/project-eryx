import crypto from "node:crypto";
import { prisma } from "@project-eryx/db";
import { OrderError } from "../order/order.service";
import { DEFAULT_INITIAL_CAPITAL } from "../../lib/constants";

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): string {
  return `eryx_${crypto.randomBytes(24).toString("base64url")}`;
}

export interface CreateAgentInput {
  userId: string;
  name: string;
  description?: string | undefined;
  model?: string | undefined;
  strategy?: string | undefined;
}

/** Create an agent, its AGENTIC account, and a one-time API key. */
export async function createAgent(input: CreateAgentInput) {
  const { userId, name } = input;

  const agent = await prisma.$transaction(async (tx) => {
    const created = await tx.agent.create({
      data: {
        user_id: userId,
        name,
        description: input.description ?? "",
        model: input.model ?? "",
        strategy: input.strategy ?? "",
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    await tx.account.create({
      data: {
        agent_id: created.id,
        account_type: "AGENTIC",
        cash_balance: DEFAULT_INITIAL_CAPITAL,
        blocked_cash: 0,
        currency: "USD",
        status: "ACTIVE",
      },
    });

    return created;
  });

  const apiKey = generateApiKey();
  await prisma.agent.update({
    where: { id: agent.id },
    data: { api_key_hash: hashApiKey(apiKey) },
  });

  const account = await prisma.account.findFirst({
    where: { agent_id: agent.id },
  });

  // Record the initial capital as a deposit so leaderboard P&L is accurate.
  if (account) {
    await prisma.cashLedger.create({
      data: {
        account_id: account.id,
        type: "DEPOSIT",
        amount: DEFAULT_INITIAL_CAPITAL,
        balance_after: DEFAULT_INITIAL_CAPITAL,
        reference_id: `initial-agent-${agent.id}`,
        description: "Initial agent capital",
        created_at: new Date(),
      },
    });
  }

  return { agent, account, apiKey };
}

export async function listAgents(userId: string) {
  return prisma.agent.findMany({
    where: { user_id: userId },
    include: { accounts: true },
    orderBy: { created_at: "desc" },
  });
}

export async function getAgentAccount(agentId: string) {
  const account = await prisma.account.findFirst({
    where: { agent_id: agentId },
  });
  if (!account) throw new OrderError("Agent account not found", 404, "AGENT_ACCOUNT_NOT_FOUND");
  return account;
}
