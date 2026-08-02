import type { JwtPayload } from "jsonwebtoken";
import type { Agent } from "@project-eryx/db";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
      } & JwtPayload;
      /** Set by the agent API-key middleware. */
      agent?: Agent;
    }
  }
}

export {};
