import { compare } from "bcryptjs";
import { loginSchema } from "@vineyard/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { serializePublicUser } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { getAuthUser } from "./auth.middleware.js";
import { signAccessToken } from "./tokens.js";

export const publicAuthRouter = Router();
export const authRouter = Router();

const invalidLogin = () =>
  new HttpError(401, "UNAUTHORIZED", "Invalid email or password");

publicAuthRouter.post("/login", async (req, res) => {
  const body = loginSchema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: { email: body.email, deletedAt: null },
  });
  if (!user) {
    throw invalidLogin();
  }

  let passwordMatches = false;
  try {
    passwordMatches = await compare(body.password, user.passwordHash);
  } catch {
    passwordMatches = false;
  }
  if (!passwordMatches) {
    throw invalidLogin();
  }

  const publicUser = serializePublicUser(user);
  res.json({
    data: {
      token: signAccessToken(publicUser),
      user: publicUser,
    },
  });
});

authRouter.post("/logout", (_req, res) => {
  res.json({ data: { ok: true } });
});

authRouter.get("/me", async (req, res) => {
  const authUser = getAuthUser(req);
  const user = await prisma.user.findFirst({
    where: { id: authUser.id, deletedAt: null },
  });
  if (!user) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }
  res.json({ data: serializePublicUser(user) });
});
