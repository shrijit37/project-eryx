import type { Agent } from "@project-eryx/db";

declare global {
  namespace Express {
    interface Request {
      /** Local user id resolved from the shared auth session cookie. */
      user?: {
        userId: string;
      };
      /** Set by the agent API-key middleware. */
      agent?: Agent;
    }
  }
}

export {};
