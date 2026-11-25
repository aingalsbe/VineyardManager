import { compare } from "bcryptjs";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  updateMeSchema,
} from "@vineyard/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { serializePublicUser } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import {
  changeOwnPassword,
  requestPasswordReset,
  resetPasswordWithToken,
  updateOwnProfile,
} from "./account.service.js";
import { getAuthUser } from "./auth.middleware.js";
import {
  clearSessionCookie,
  setSessionCookie,
  signAccessToken,
} from "./tokens.js";

export const publicAuthRouter = Router();
export const authRouter = Router();

/** Precomputed bcrypt (cost 10) hash used when an email is not found to equalize login timing. */
const DUMMY_PASSWORD_HASH =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8u1uC6E3Q6kY7p3L8b2V7g3lN4y5eK";

const invalidLogin = () =>
  new HttpError(401, "UNAUTHORIZED", "Invalid email or password");

publicAuthRouter.post("/login", async (req, res) => {
  const body = loginSchema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: { email: body.email, deletedAt: null },
  });

  const hashToCheck = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  let passwordMatches = false;
  try {
    passwordMatches = await compare(body.password, hashToCheck);
  } catch {
    passwordMatches = false;
  }

  if (!user || !passwordMatches || user.disabledAt) {
    throw invalidLogin();
  }

  const publicUser = serializePublicUser(user);
  const token = signAccessToken({
    ...publicUser,
    tokenVersion: user.tokenVersion,
  });
  setSessionCookie(res, token);

  res.json({
    data: {
      token,
      user: publicUser,
    },
  });
});

publicAuthRouter.post("/forgot-password", async (req, res) => {
  const body = forgotPasswordSchema.parse(req.body);
  const result = await requestPasswordReset(body.email);
  res.json({ data: result });
});

publicAuthRouter.post("/reset-password", async (req, res) => {
  const body = resetPasswordSchema.parse(req.body);
  await resetPasswordWithToken(body);
  clearSessionCookie(res);
  res.json({ data: { ok: true } });
});

authRouter.post("/logout", async (req, res) => {
  const actor = getAuthUser(req);
  await prisma.user.updateMany({
    where: { id: actor.id, deletedAt: null },
    data: { tokenVersion: { increment: 1 } },
  });
  clearSessionCookie(res);
  res.json({ data: { ok: true } });
});

authRouter.get("/me", (req, res) => {
  res.json({ data: getAuthUser(req) });
});

authRouter.patch("/me", async (req, res) => {
  const actor = getAuthUser(req);
  const body = updateMeSchema.parse(req.body);
  const user = await updateOwnProfile(actor.id, body);
  res.json({ data: user });
});

authRouter.post("/change-password", async (req, res) => {
  const actor = getAuthUser(req);
  const body = changePasswordSchema.parse(req.body);
  const updated = await changeOwnPassword(actor.id, body);
  const token = signAccessToken({
    ...updated.user,
    tokenVersion: updated.tokenVersion,
  });
  setSessionCookie(res, token);
  res.json({ data: { ok: true } });
});
