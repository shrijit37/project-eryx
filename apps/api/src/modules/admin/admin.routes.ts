import Express from "express";
import {
  handleMetrics,
  handleReconcile,
  handleReconcileLatest,
} from "./admin.controller";

const router: Express.Router = Express.Router();

router.get("/metrics", handleMetrics);
router.get("/reconcile", handleReconcile);
router.get("/reconcile/latest", handleReconcileLatest);

export default router;