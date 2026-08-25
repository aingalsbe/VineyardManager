import type { NextFunction, Request, Response } from "express";
import type { PublicUser } from "@vineyard/shared";
import { HttpError } from "../../middleware/error-handler.js";
import { verifyAccessToken } from "./tokens.js";

export function getAuthUser(req: Request): PublicUser {
  if (!req.user) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }
  return req.user;
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new HttpError(401, "UNAUTHORIZED", "Unauthorized"));
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    next(new HttpError(401, "UNAUTHORIZED", "Unauthorized"));
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
}
