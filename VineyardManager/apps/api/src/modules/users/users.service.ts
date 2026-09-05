import { randomInt } from "node:crypto";
import { hash } from "bcryptjs";
import { Prisma, type User, type Vineyard } from "@prisma/client";
import type { PublicUser, UserRole } from "@vineyard/shared";
import { prisma } from "../../db/prisma.js";
import { serializePublicUser } from "../../lib/serialize.js";
import { HttpError } from "../../middleware/error-handler.js";

const BCRYPT_ROUNDS = 10;

const DEFAULT_NOTIFICATION_PREFS = {
  emailEnabled: true,
  pushEnabled: true,
  frequency: "weekly" as const,
};

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*";
const ALL_PASSWORD_CHARS = UPPER + LOWER + DIGITS + SYMBOLS;

export function generateTemporaryPassword(): string {
  const chars = [
    pick(UPPER),
    pick(LOWER),
    pick(DIGITS),
    pick(SYMBOLS),
    ...Array.from({ length: 12 }, () => pick(ALL_PASSWORD_CHARS)),
  ];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const current = chars[i];
    const swap = chars[j];
    if (current === undefined || swap === undefined) continue;
    chars[i] = swap;
    chars[j] = current;
  }
  return chars.join("");
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)] ?? alphabet[0] ?? "A";
}

export async function requireVineyard(id: string): Promise<Vineyard> {
  const vineyard = await prisma.vineyard.findFirst({
    where: { id, deletedAt: null },
  });
  if (!vineyard) {
    throw new HttpError(404, "NOT_FOUND", "Vineyard not found");
  }
  return vineyard;
}

export async function listUsers(includeDeleted: boolean): Promise<PublicUser[]> {
  const users = await prisma.user.findMany({
    where: includeDeleted ? undefined : { deletedAt: null },
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
  });
  return users.map(serializePublicUser);
}

export async function inviteUser(input: {
  email: string;
  displayName: string;
  role: UserRole;
}): Promise<{ user: PublicUser; temporaryPassword: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing && existing.deletedAt === null) {
    throw new HttpError(409, "USER_EXISTS", "A user with that email already exists");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hash(temporaryPassword, BCRYPT_ROUNDS);

  try {
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            displayName: input.displayName,
            role: input.role,
            passwordHash,
            deletedAt: null,
            disabledAt: null,
          },
        })
      : await prisma.user.create({
          data: {
            email: input.email,
            displayName: input.displayName,
            role: input.role,
            passwordHash,
            notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
          },
        });

    return { user: serializePublicUser(user), temporaryPassword };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new HttpError(
        409,
        "USER_EXISTS",
        "A user with that email already exists",
      );
    }
    throw error;
  }
}

export async function updateUser(input: {
  actor: PublicUser;
  vineyard: Vineyard;
  userId: string;
  role?: UserRole;
  disabled?: boolean;
  displayName?: string;
}): Promise<PublicUser> {
  const target = await requireLiveUser(input.userId);
  assertCanMutate(input.actor, target, input.vineyard, {
    role: input.role,
    disabled: input.disabled,
    deleting: false,
  });
  await assertNotLastEnabledPowerUser(target, {
    role: input.role,
    disabled: input.disabled,
    deleting: false,
  });

  const data: {
    role?: UserRole;
    displayName?: string;
    disabledAt?: Date | null;
  } = {};
  if (input.role !== undefined) data.role = input.role;
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.disabled === true) data.disabledAt = new Date();
  if (input.disabled === false) data.disabledAt = null;

  const updated = await prisma.user.update({
    where: { id: target.id },
    data,
  });
  return serializePublicUser(updated);
}

export async function removeUser(input: {
  actor: PublicUser;
  vineyard: Vineyard;
  userId: string;
}): Promise<void> {
  const target = await requireLiveUser(input.userId);
  assertCanMutate(input.actor, target, input.vineyard, {
    deleting: true,
  });
  await assertNotLastEnabledPowerUser(target, { deleting: true });

  const now = new Date();
  await prisma.user.update({
    where: { id: target.id },
    data: {
      deletedAt: target.deletedAt ?? now,
      disabledAt: target.disabledAt ?? now,
    },
  });
}

async function requireLiveUser(userId: string): Promise<User> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });
  if (!user) {
    throw new HttpError(404, "NOT_FOUND", "User not found");
  }
  return user;
}

function assertCanMutate(
  actor: PublicUser,
  target: User,
  vineyard: Vineyard,
  action: { role?: UserRole; disabled?: boolean; deleting?: boolean },
): void {
  if (actor.id === target.id) {
    throw new HttpError(
      403,
      "CANNOT_MODIFY_SELF",
      "You cannot change your own role or access.",
    );
  }

  const demoting = action.role !== undefined && action.role !== target.role;
  const disabling = action.disabled === true;
  const deleting = action.deleting === true;

  if (target.id === vineyard.ownerId && (demoting || disabling || deleting)) {
    throw new HttpError(
      403,
      "CANNOT_MODIFY_OWNER",
      "The vineyard owner cannot be disabled, demoted, or removed.",
    );
  }
}

async function assertNotLastEnabledPowerUser(
  target: User,
  action: { role?: UserRole; disabled?: boolean; deleting?: boolean },
): Promise<void> {
  const demotingFromPowerUser =
    target.role === "power_user" &&
    action.role !== undefined &&
    action.role !== "power_user";
  const disabling = action.disabled === true;
  const deleting = action.deleting === true;
  if (!demotingFromPowerUser && !disabling && !deleting) return;
  if (target.role !== "power_user" || target.disabledAt) return;

  const enabledPowerUsers = await prisma.user.count({
    where: {
      role: "power_user",
      deletedAt: null,
      disabledAt: null,
    },
  });
  if (enabledPowerUsers <= 1) {
    throw new HttpError(
      409,
      "LAST_POWER_USER",
      "At least one enabled power user must remain.",
    );
  }
}
