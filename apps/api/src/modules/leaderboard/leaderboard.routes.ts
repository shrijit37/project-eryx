import Express from "express";
import { getLeaderboard } from "./leaderboard.service";
import { logger } from "../../lib/logger";

const router: Express.Router = Express.Router();

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await getLeaderboard(limit);
    return res.json({ success: true, data: rows });
  } catch (e) {
    logger.error({ err: String(e) }, "leaderboard failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
