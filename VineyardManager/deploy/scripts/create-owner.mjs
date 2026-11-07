import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const MIN_PASSWORD = 10;
const LOCK_KEY = 842615;

if (!input.isTTY || !output.isTTY) {
  console.error("owner bootstrap requires a TTY");
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    output.write(question);
    const chars = [];
    input.setRawMode(true);
    input.resume();
    const onData = (buf) => {
      const text = buf.toString("utf8");
      if (text === "\u0003") {
        input.setRawMode(false);
        input.off("data", onData);
        reject(new Error("aborted"));
        return;
      }
      if (text === "\r" || text === "\n") {
        input.setRawMode(false);
        input.off("data", onData);
        output.write("\n");
        resolve(chars.join(""));
        return;
      }
      if (text === "\u007f" || text === "\b") {
        chars.pop();
        return;
      }
      if (text < " " ) return;
      chars.push(text);
    };
    input.on("data", onData);
  });
}

const rl = createInterface({ input, output });

try {
  const email = (await rl.question("Email: ")).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Enter a valid email");
    process.exit(1);
  }
  const displayName = (await rl.question("Display name: ")).trim();
  if (!displayName || displayName.length > 120) {
    console.error("Enter a name");
    process.exit(1);
  }
  rl.close();

  const password = await promptHidden("Password: ");
  const confirm = await promptHidden("Confirm password: ");
  if (password !== confirm) {
    console.error("confirmation does not match");
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD) {
    console.error(`Password must be at least ${MIN_PASSWORD} characters`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
      const existing = await tx.user.count();
      if (existing > 0) {
        const error = new Error("already bootstrapped");
        error.code = "BOOTSTRAPPED";
        throw error;
      }
      return tx.user.create({
        data: {
          email,
          displayName,
          passwordHash: await hash(password, 10),
          role: "power_user",
          notificationPrefs: {
            emailEnabled: true,
            pushEnabled: true,
            frequency: "weekly",
            weeklyDigest: true,
          },
        },
        select: { id: true },
      });
    });
    console.log(`created owner ${user.id}`);
  } catch (error) {
    if (error && error.code === "BOOTSTRAPPED") {
      console.error("already bootstrapped");
      process.exit(2);
    }
    console.error("owner bootstrap failed");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
} catch (error) {
  if (error && error.message === "aborted") {
    console.error("aborted");
    process.exit(1);
  }
  throw error;
}
