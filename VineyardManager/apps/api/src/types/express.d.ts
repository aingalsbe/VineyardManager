import type { PublicUser } from "@vineyard/shared";

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

export {};
