import jwt, { type SignOptions } from "jsonwebtoken";
import type { PublicUser, UserRole } from "@vineyard/shared";
import { config } from "../../config.js";
import { HttpError } from "../../middleware/error-handler.js";

type AccessTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  displayName: string;
};

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === "string" &&
    typeof payload.email === "string" &&
    typeof payload.role === "string" &&
    typeof payload.displayName === "string"
  );
}

export function signAccessToken(user: PublicUser): string {
  const options: SignOptions = {
    expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    },
    config.jwtSecret,
    options,
  );
}

export function verifyAccessToken(token: string): PublicUser {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!isAccessTokenPayload(payload)) {
      throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      displayName: payload.displayName,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }
}
