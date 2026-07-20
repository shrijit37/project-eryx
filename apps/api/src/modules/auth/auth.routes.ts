import express from "express";
import { z } from "zod";
import { handleLogin, handleRegister } from "../auth/auth.controller";

//types
import { LoginReqSchema, RegisterReqSchema } from "../auth/auth.validation";
import type { ControllerResult } from "../auth/auth.validation";

const router: express.Router = express.Router();

router.get("/test", (req: express.Request, res: express.Response) => {
    res.json({ message: "Auth route is working!" });
});


router.post("/register", async (req: express.Request, res: express.Response)=> {
    const result = z.safeParse(RegisterReqSchema, req.body);
    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }

    // Handle registration logic here
    const registerResponse: ControllerResult = await handleRegister(result.data);
    res.status(registerResponse.statusCode).json(registerResponse);
})



router.post("/login", async (req: express.Request, res: express.Response) => {
    const result = z.safeParse(LoginReqSchema, req.body);

    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }


    // Handle login logic here
    // const loginResposne: Promise<ControllerResult> = await handleLogin(result.data.email, result.data.password);

});
export default router;
