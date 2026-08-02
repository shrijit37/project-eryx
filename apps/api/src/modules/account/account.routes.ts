import Express from "express";
import {
  handleListAccounts,
  handleAccountDetail,
  handleDeposit,
  handleLedger,
  handleTrades,
} from "./account.controller";

const router: Express.Router = Express.Router();

router.get("/", handleListAccounts);
router.get("/:id", handleAccountDetail);
router.get("/:id/ledger", handleLedger);
router.get("/:id/trades", handleTrades);
router.post("/deposit", handleDeposit);

export default router;
