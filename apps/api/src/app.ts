import express from "express";
import { rateLimit, MINUTE } from "express-rate-limit";
import { prisma } from "@project-eryx/db";
import orderRouter from "./modules/order/order.routes";
import accountRouter from "./modules/account/account.routes";
import agentRouter from "./modules/agent/agent.routes";
import agentConsoleRouter from "./modules/agent/agent.console.routes";
import leaderboardRouter from "./modules/leaderboard/leaderboard.routes";
import candlesRouter from "./modules/candles/candles.routes";
import arenaRouter from "./modules/arena/arena.routes";
import adminRouter from "./modules/admin/admin.routes";
import { scheduleReconcile } from "./modules/admin/reconcile.job";
import authenticateToken from "./modules/auth/auth.middleware";
import { getRedis } from "./lib/redis";
import { logger, childLogger } from "./lib/logger";
import { startOrderTriggerLoop } from "./modules/order/order.trigger";

const log = childLogger("app");
const app = express();
const PORT = Number(process.env.PORT) || 8080;
const envVariables = ["DATABASE_URL"];

envVariables.forEach((key) => {
  if (!process.env[key]) {
    log.error({ key }, "Required environment variable is not defined");
    process.exit(1);
  }
});

// ----- middleware -----
const limiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  ipv6Subnet: 56,
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(limiter);
app.use(
  // Reflect the caller's origin and allow credentials: the browser now sends
  // the `.shrijit.tech` auth cookie instead of a Bearer token, and browsers
  // reject `*` whenever a request is made with credentials included.
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.header("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,X-API-Key");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  }
);

const connectDb = async () => {
  try {
    await prisma.$connect();
    log.info({}, "db connected");
  } catch (e: any) {
    log.error({ err: e?.message }, "error connecting to db");
  }
};
const connectRedis = async () => {
  try {
    await getRedis().ping();
    log.info({}, "redis connected");
  } catch (e: any) {
    log.error({ err: e?.message }, "error connecting to redis");
  }
};

// ----- routes -----
// Uniform fleet health contract (standards/platform.md#health): exactly
// GET /health -> { status, service, version, checks }. Postgres and Redis
// are both critical: either down means 503. No /api/health alias.
app.get("/health", async (_req, res) => {
  let database: "up" | "down" = "down";
  let redis: "up" | "down" = "down";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "up";
  } catch (e: any) {
    log.error({ err: e?.message }, "health db failed");
  }
  try {
    await getRedis().ping();
    redis = "up";
  } catch (e: any) {
    log.error({ err: e?.message }, "health redis failed");
  }
  const status = database === "up" && redis === "up" ? "ok" : "down";
  res.status(status === "down" ? 503 : 200).json({
    status,
    service: "eryx-api",
    version: process.env.APP_VERSION || "unknown",
    checks: { database, redis },
  });
});

app.use("/api/orders", authenticateToken, orderRouter);
app.use("/api/account", authenticateToken, accountRouter);
app.use("/api/agents", authenticateToken, agentRouter);
app.use("/api/agent", agentConsoleRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/candles", candlesRouter);
app.use("/api/arena", arenaRouter);
app.use("/api/admin", adminRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

app.listen(PORT, async () => {
  log.info({ port: PORT }, "API listening");
  await connectDb();
  await connectRedis();
  const started = startOrderTriggerLoop(Number(process.env.TRIGGER_MS) || 3000) !== null;
  log.info({ triggerLoop: started }, "limit-order trigger loop started");
  scheduleReconcile(Number(process.env.RECONCILE_MS) || 15 * 60_000);
});