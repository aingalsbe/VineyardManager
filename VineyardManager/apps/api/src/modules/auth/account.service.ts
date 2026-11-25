import { createHash, randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { PublicUser } from "@vineyard/shared";
import { config } from "../../config.js";
import { prisma } from "../../db/prisma.js";
import { serializePublicUser } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";
import { sendPasswordResetEmail } from "../../lib/mailer.js";

const BCRYPT_ROUNDS = 10;
const RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function updateOwnProfile(
  userId: string,
  input: { displayName?: string; email?: string; currentPassword?: string },
): Promise<PublicUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, disabledAt: null },
  });
  if (!user) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const emailChanging = input.email !== undefined && input.email !== user.email;
  if (emailChanging) {
    if (!input.currentPassword) {
      throw new HttpError(
        401,
        "INVALID_CREDENTIALS",
        "Enter your current password to change your email",
      );
    }
    let matches = false;
    try {
      matches = await compare(input.currentPassword, user.passwordHash);
    } catch {
      matches = false;
    }
    if (!matches) {
      throw new HttpError(
        401,
        "INVALID_CREDENTIALS",
        "Current password is incorrect",
      );
    }

    const taken = await prisma.user.findFirst({
      where: {
        email: input.email,
        deletedAt: null,
        id: { not: user.id },
      },
      select: { id: true },
    });
    if (taken) {
      throw new HttpError(409, "EMAIL_TAKEN", "That email is already in use");
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
      },
    });
    return serializePublicUser(updated);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new HttpError(409, "EMAIL_TAKEN", "That email is already in use");
    }
    throw error;
  }
}

export async function changeOwnPassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<{ user: PublicUser; tokenVersion: number }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, disabledAt: null },
  });
  if (!user) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }

  let matches = false;
  try {
    matches = await compare(input.currentPassword, user.passwordHash);
  } catch {
    matches = false;
  }
  if (!matches) {
    throw new HttpError(
      401,
      "INVALID_CREDENTIALS",
      "Current password is incorrect",
    );
  }

  const passwordHash = await hash(input.newPassword, BCRYPT_ROUNDS);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      tokenVersion: { increment: 1 },
    },
  });
  return {
    user: serializePublicUser(updated),
    tokenVersion: updated.tokenVersion,
  };
}

export async function requestPasswordReset(email: string): Promise<{
  ok: true;
  devResetUrl?: string;
}> {
  const generic = { ok: true as const };
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null, disabledAt: null },
  });
  if (!user) {
    return generic;
  }

  const rawToken = generateResetToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await prisma.$transaction([
    prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    }),
  ]);

  const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
  // Mail is sent in the background so the response time doesn't depend on mail and doesn't reveal whether the email exists.
  void sendPasswordResetEmail(user.email, resetUrl).catch(() => {});

  if (config.isProduction) {
    return generic;
  }
  return { ok: true, devResetUrl: resetUrl };
}

export async function resetPasswordWithToken(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const tokenHash = hashToken(input.token);
  const now = new Date();
  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash },
    include: {
      user: { select: { id: true, deletedAt: true, disabledAt: true } },
    },
  });
  if (
    !reset ||
    reset.usedAt ||
    reset.expiresAt.getTime() <= now.getTime() ||
    reset.user.deletedAt ||
    reset.user.disabledAt
  ) {
    throw new HttpError(
      400,
      "RESET_INVALID",
      "This reset link is invalid or has expired.",
    );
  }

  const passwordHash = await hash(input.newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction(async (tx) => {
    const claimTime = new Date();
    const claimed = await tx.passwordReset.updateMany({
      where: {
        id: reset.id,
        usedAt: null,
        expiresAt: { gt: claimTime },
      },
      data: { usedAt: claimTime },
    });
    if (claimed.count !== 1) {
      throw new HttpError(
        400,
        "RESET_INVALID",
        "This reset link is invalid or has expired.",
      );
    }

    const updated = await tx.user.updateMany({
      where: { id: reset.userId, deletedAt: null, disabledAt: null },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new HttpError(
        400,
        "RESET_INVALID",
        "This reset link is invalid or has expired.",
      );
    }
  });
}

/** Delete expired or long-used PasswordReset tokens (housekeeping). */
export async function pruneExpiredPasswordResets(
  retentionDays = 7,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.passwordReset.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { usedAt: { lt: cutoff } },
      ],
    },
  });
  return result.count;
}
