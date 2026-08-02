import Express from "express";
import {
  handleOrder,
  handleListOrders,
  handleCancelOrder,
} from "./order.controller";

const router: Express.Router = Express.Router();

router.post("/", handleOrder);
router.get("/", handleListOrders);
router.post("/:account_id/:orderId/cancel", handleCancelOrder);

export default router;
