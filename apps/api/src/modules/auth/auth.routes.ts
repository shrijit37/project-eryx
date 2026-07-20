import express from "express";
import { handleLogin, handleRegister } from "../auth/auth.controller";

//types
import { LoginReqSchema, RegisterReqSchema } from "../auth/auth.validation";
import type { ControllerResult } from "../auth/auth.validation";

const router: express.Router = express.Router();

router.get("/test", (req: express.Request, res: express.Response) => {
  res.json({ message: "Auth route is working!" });
});

router.post(
  "/register",
  async (req: express.Request, res: express.Response) => {
    const result = RegisterReqSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const registerResponse: ControllerResult = await handleRegister(
      result.data,
    );
    res.status(registerResponse.statusCode).json(registerResponse);
  },
);

router.post("/login", async (req: express.Request, res: express.Response) => {
  const result = LoginReqSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  const loginResponse: ControllerResult = await handleLogin(result.data);
  res.status(loginResponse.statusCode).json(loginResponse);
});
export default router;
