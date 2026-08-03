import Express from "express";
import { handleCandles } from "./candles.controller";

const router: Express.Router = Express.Router();

router.get("/:symbol", handleCandles);

export default router;