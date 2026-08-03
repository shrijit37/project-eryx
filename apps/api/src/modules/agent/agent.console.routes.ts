import Express from "express";
import { authenticateAgent } from "./agent.middleware";
import {
  handleAgentOrder,
  handleAgentListOrders,
  handleAgentCancel,
  handleAgentPortfolio,
  handleAgentPrice,
  handleAgentCandles,
  handleAgentArenaOrder,
  handleAgentArenaPortfolio,
} from "./agent.console.controller";

const router: Express.Router = Express.Router();

router.use(authenticateAgent);

router.post("/orders", handleAgentOrder);
router.get("/orders", handleAgentListOrders);
router.post("/orders/:orderId/cancel", handleAgentCancel);
router.get("/portfolio", handleAgentPortfolio);
router.get("/price/:symbol", handleAgentPrice);
router.get("/candles/:symbol", handleAgentCandles);
router.post("/arena/orders", handleAgentArenaOrder);
router.get("/arena/portfolio", handleAgentArenaPortfolio);

export default router;
