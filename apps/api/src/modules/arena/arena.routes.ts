import Express from "express";
import authenticateToken from "../auth/auth.middleware";
import {
  handleCreateArenaAccount,
  handleArenaOrder,
  handleArenaCancel,
  handleArenaBook,
  handleArenaLeaderboard,
} from "./arena.controller";

const router: Express.Router = Express.Router();

router.get("/book/:symbol", handleArenaBook); // public
router.get("/leaderboard", handleArenaLeaderboard); // public

router.post("/account", authenticateToken, handleCreateArenaAccount);
router.post("/orders", authenticateToken, handleArenaOrder);
router.post("/orders/:account_id/:orderId/cancel", authenticateToken, handleArenaCancel);

export default router;