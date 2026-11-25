import type { Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { PublicUser, UserRole } from "@vineyard/shared";
import { config } from "../../config.js";
import { HttpError } from "../../middleware/error-handler.js";

const DEFAULT_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type AccessTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  displayName: string;
  tv: number;
};

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === "string" &&
    typeof payload.email === "string" &&
    typeof payload.role === "string" &&
    typeof payload.displayName === "string" &&
    typeof payload.tv === "number" &&
    Number.isInteger(payload.tv) &&
    payload.tv >= 0
  );
}

export type AccessTokenUser = {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  tokenVersion: number;
};

/** Parse simple jwtExpiresIn strings like "7d", "24h", "30m", "3600s" into ms for cookie maxAge. */
export function parseExpiresInMs(value: string): number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const match = trimmed.match(/^(\d+)\s*([smhd])$/i);
  if (!match) return DEFAULT_COOKIE_MAX_AGE_MS;
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const mult =
    unit === "s"
      ? 1000
      : unit === "m"
        ? 60_000
        : unit === "h"
          ? 3_600_000
          : 86_400_000;
  return amount * mult;
}

export function signAccessToken(
  user: Pick<PublicUser, "id" | "email" | "role" | "displayName"> & {
    tokenVersion?: number;
  },
): string {
  const options: SignOptions = {
    algorithm: "HS256",
    expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      tv: user.tokenVersion ?? 0,
    },
    config.jwtSecret,
    options,
  );
}

export function verifyAccessToken(token: string): AccessTokenUser {
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
    });
    if (!isAccessTokenPayload(payload)) {
      throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      displayName: payload.displayName,
      tokenVersion: payload.tv,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/api",
    maxAge: parseExpiresInMs(config.jwtExpiresIn),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/api",
  });
}
