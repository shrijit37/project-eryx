import crypto from "node:crypto";
import type { Request, Response } from "express";
import { createAgent, listAgents, hashApiKey } from "./agent.service";
import { OrderError } from "../order/order.service";
import { prisma } from "@project-eryx/db";
import { z } from "zod";

const createAgentSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  model: z.string().max(64).optional(),
  strategy: z.string().max(500).optional(),
});

export async function handleCreateAgent(req: Request, res: Response) {
  try {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { agent, account, apiKey } = await createAgent({
      userId,
      name: parsed.data.name,
      description: parsed.data.description,
      model: parsed.data.model,
      strategy: parsed.data.strategy,
    });

    // The API key is only shown once — store only its hash.
    return res.status(201).json({
      success: true,
      data: { agent, account_id: account?.id, api_key: apiKey },
      message: "Save this API key now — it will not be shown again.",
    });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleListAgents(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
    const agents = await listAgents(userId);
    // Never leak key hashes over the wire.
    const safe = agents.map((a: any) => {
      const { api_key_hash, ...rest } = a;
      return { ...rest, has_api_key: Boolean(api_key_hash) };
    });
    return res.json({ success: true, data: safe });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/** Rotate an agent's API key. */
export async function handleRotateKey(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
    const agent = await prisma.agent.findUnique({ where: { id: String(req.params.id) } });
    if (!agent || agent.user_id !== userId) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }
    const apiKey = `eryx_${crypto.randomBytes(24).toString("base64url")}`;
    await prisma.agent.update({
      where: { id: agent.id },
      data: { api_key_hash: hashApiKey(apiKey) },
    });
    return res.json({ success: true, data: { api_key: apiKey } });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}