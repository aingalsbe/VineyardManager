import type { NextFunction, Request, Response } from "express";
import {
  canOperateVineyard,
  canSetupVineyard,
  type PublicUser,
} from "@vineyard/shared";
import { config } from "../../config.js";
import { prisma } from "../../db/prisma.js";
import { serializePublicUser } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { verifyAccessToken } from "./tokens.js";

export const FORBIDDEN_MESSAGE = "Your role cannot change this.";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function extractToken(
  req: Request,
): { token: string; source: "cookie" | "bearer" } | null {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const cookieToken = cookies?.[config.sessionCookieName];
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return { token: cookieToken.trim(), source: "cookie" };
  }

  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const bearer = header.slice("Bearer ".length).trim();
    if (bearer) {
      return { token: bearer, source: "bearer" };
    }
  }

  return null;
}

export function getAuthUser(req: Request): PublicUser {
  if (!req.user) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }
  return req.user;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const extracted = extractToken(req);
  if (!extracted) {
    next(new HttpError(401, "UNAUTHORIZED", "Unauthorized"));
    return;
  }

  try {
    const payload = verifyAccessToken(extracted.token);
    const user = await prisma.user.findFirst({
      where: { id: payload.id, deletedAt: null, disabledAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        disabledAt: true,
        tokenVersion: true,
      },
    });
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      next(new HttpError(401, "UNAUTHORIZED", "Unauthorized"));
      return;
    }
    req.user = serializePublicUser(user);
    req.authSource = extracted.source;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Defense-in-depth CSRF guard for cookie-authenticated state-changing requests.
 * Requires both a same-origin Origin/Referer header matching WEB_ORIGIN and the
 * custom X-Requested-With: fetch header (which browsers never attach on plain
 * cross-site form submissions). Bearer-authenticated API/mobile clients bypass.
 */
export function requireCsrfForCookieMutations(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.authSource !== "cookie" || SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const expectedOrigin = normalizeOrigin(config.webOrigin);
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const requestOrigin =
    typeof originHeader === "string"
      ? normalizeOrigin(originHeader)
      : typeof refererHeader === "string"
        ? normalizeOrigin(refererHeader)
        : null;

  const requestedWith = req.headers["x-requested-with"];
  if (
    !expectedOrigin ||
    requestOrigin !== expectedOrigin ||
    requestedWith !== "fetch"
  ) {
    next(new HttpError(403, "CSRF_FAILED", "Cross-site request rejected"));
    return;
  }

  next();
}

export function requireOperate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const user = getAuthUser(req);
    if (!canOperateVineyard(user.role)) {
      next(new HttpError(403, "FORBIDDEN", FORBIDDEN_MESSAGE));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireSetup(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const user = getAuthUser(req);
    if (!canSetupVineyard(user.role)) {
      next(new HttpError(403, "FORBIDDEN", FORBIDDEN_MESSAGE));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
