import Express from "express";
import {
  handleCreateAgent,
  handleListAgents,
  handleRotateKey,
} from "./agent.controller";

const router: Express.Router = Express.Router();

router.post("/", handleCreateAgent);
router.get("/", handleListAgents);
router.post("/:id/rotate-key", handleRotateKey);

export default router;