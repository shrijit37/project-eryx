import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { rateLimit, MINUTE } from "express-rate-limit";
import { prisma } from "@project-eryx/db";
import authRouter from "./modules/auth/auth.routes";
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
const envVariables = ["JWT_SECRET", "DATABASE_URL"];

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
  // Permissive CORS for local dev (the Next.js dashboard is on a separate origin).
  (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-API-Key");
    if (_req.method === "OPTIONS") return res.sendStatus(204);
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
app.get("/api/health", async (_req, res) => {
  const health = { database: false, redis: false };
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database = true;
  } catch (e: any) {
    log.error({ err: e?.message }, "health db failed");
  }
  try {
    await getRedis().ping();
    health.redis = true;
  } catch (e: any) {
    log.error({ err: e?.message }, "health redis failed");
  }
  const healthy = health.database && health.redis;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "unhealthy",
    services: health,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);

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