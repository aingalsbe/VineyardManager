import { Prisma } from "@prisma/client";
import {
  calendarDateInZone,
  wantsWeeklyDigest,
  type PublicUser,
} from "@vineyard/shared";
import { config } from "../../config.js";
import { prisma } from "../../db/prisma.js";
import {
  isLocalAddress,
  mailErrorMessage,
  sendMail,
} from "../../lib/mailer.js";
import { HttpError } from "../../middleware/error-handler.js";
import { buildDigestData, mondayOf } from "./digest.service.js";
import { render } from "./digest.template.js";

/** DigestLog.weekStart is the Monday of the week in this zone. */
export const DIGEST_WEEK_TZ = "America/Chicago";

const IN_PROGRESS = "in progress";
const LOCAL_SKIP_REASON = "Recipient is a *.local demo address; not sent.";
const NOT_CONFIGURED_REASON = "SMTP is not configured (SMTP_HOST / SMTP_URL).";

/** Monday (YYYY-MM-DD, America/Chicago) of the week containing `asOf`. */
export function digestWeekStart(asOf: Date = new Date()): string {
  return mondayOf(calendarDateInZone(asOf, DIGEST_WEEK_TZ));
}

function weekStartDate(weekStart: string): Date {
  return new Date(`${weekStart}T00:00:00.000Z`);
}

export type ScheduledRecipientOutcome =
  | "sent"
  | "failed"
  | "skipped_local"
  | "already_logged";

export type ScheduledDigestResult = {
  vineyardId: string;
  vineyardName: string;
  weekStart: string;
  /** Eligible manager/power_user accounts (emailEnabled + weeklyDigest not false). */
  eligible: number;
  /** Active manager/power_user accounts excluded by their prefs (not logged). */
  optedOut: number;
  sent: number;
  failed: number;
  skipped: number;
  alreadyLogged: number;
  recipients: Array<{
    userId: string;
    email: string;
    outcome: ScheduledRecipientOutcome;
    logId: string | null;
    error?: string;
  }>;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/**
 * Scheduled weekly digest for one vineyard. Idempotent per (vineyard, user, week):
 * the partial unique index digest_logs_scheduled_once allows one scheduled row,
 * and the row is claimed BEFORE sending, so a re-run (or an overlapping run)
 * never double-sends. Rows left `failed` are retried on the next run.
 * SMTP errors are logged as failed and the run continues.
 */
export async function runScheduledDigest(
  vineyardId: string,
  asOf: Date = new Date(),
): Promise<ScheduledDigestResult> {
  const weekStart = digestWeekStart(asOf);
  const weekStartValue = weekStartDate(weekStart);

  // 404s if the vineyard is missing/deleted.
  const data = await buildDigestData(vineyardId, asOf);
  const rendered = render(data);

  // Single-vineyard model: roles live on User; every active manager / power_user
  // is a member of the vineyard.
  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      disabledAt: null,
      role: { in: ["manager", "power_user"] },
    },
    select: { id: true, email: true, notificationPrefs: true },
    orderBy: { email: "asc" },
  });
  const eligibleUsers = candidates.filter((user) =>
    wantsWeeklyDigest(user.notificationPrefs),
  );

  const result: ScheduledDigestResult = {
    vineyardId,
    vineyardName: data.vineyard.name,
    weekStart,
    eligible: eligibleUsers.length,
    optedOut: candidates.length - eligibleUsers.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    alreadyLogged: 0,
    recipients: [],
  };

  for (const user of eligibleUsers) {
    const where = {
      vineyardId,
      userId: user.id,
      weekStart: weekStartValue,
      kind: "scheduled" as const,
    };

    // 1. Claim the (vineyard, user, week) slot.
    let logId: string;
    const existing = await prisma.digestLog.findFirst({ where, select: { id: true, status: true } });
    if (existing && existing.status !== "failed") {
      result.alreadyLogged += 1;
      result.recipients.push({ userId: user.id, email: user.email, outcome: "already_logged", logId: existing.id });
      continue;
    }
    if (existing) {
      // Retry a failed row. Conditional update so two overlapping runs can't both retry.
      const claimed = await prisma.digestLog.updateMany({
        where: {
          id: existing.id,
          status: "failed",
          // Skip rows another run is sending right now; a stale claim (>1h, crashed run) is retried.
          OR: [
            { error: { not: IN_PROGRESS } },
            { createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
          ],
        },
        data: { recipientEmail: user.email, error: IN_PROGRESS, providerMessageId: null, sentAt: null },
      });
      if (claimed.count === 0) {
        result.alreadyLogged += 1;
        result.recipients.push({ userId: user.id, email: user.email, outcome: "already_logged", logId: existing.id });
        continue;
      }
      logId = existing.id;
    } else {
      try {
        const created = await prisma.digestLog.create({
          data: { ...where, recipientEmail: user.email, status: "failed", error: IN_PROGRESS },
          select: { id: true },
        });
        logId = created.id;
      } catch (error) {
        if (isUniqueViolation(error)) {
          result.alreadyLogged += 1;
          result.recipients.push({ userId: user.id, email: user.email, outcome: "already_logged", logId: null });
          continue;
        }
        throw error;
      }
    }

    // 2. *.local demo accounts are never emailed.
    if (isLocalAddress(user.email)) {
      await prisma.digestLog.update({
        where: { id: logId },
        data: { status: "skipped", error: LOCAL_SKIP_REASON },
      });
      result.skipped += 1;
      result.recipients.push({ userId: user.id, email: user.email, outcome: "skipped_local", logId });
      continue;
    }

    // 3. Send; failures are logged and the run continues.
    try {
      const mail = await sendMail({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      if (!mail.sent) {
        const reason = mail.reason === "local_address" ? LOCAL_SKIP_REASON : NOT_CONFIGURED_REASON;
        await prisma.digestLog.update({ where: { id: logId }, data: { status: "failed", error: reason } });
        result.failed += 1;
        result.recipients.push({ userId: user.id, email: user.email, outcome: "failed", logId, error: reason });
        continue;
      }
      await prisma.digestLog.update({
        where: { id: logId },
        data: { status: "sent", error: null, providerMessageId: mail.messageId || null, sentAt: new Date() },
      });
      result.sent += 1;
      result.recipients.push({ userId: user.id, email: user.email, outcome: "sent", logId });
    } catch (error) {
      const message = mailErrorMessage(error);
      await prisma.digestLog.update({ where: { id: logId }, data: { status: "failed", error: message } });
      result.failed += 1;
      result.recipients.push({ userId: user.id, email: user.email, outcome: "failed", logId, error: message });
      console.error(`[digest] send to ${user.email} failed: ${message}`);
    }
  }

  return result;
}

/** Cron entry point: every non-deleted vineyard; one vineyard failing doesn't stop the rest. */
export async function runScheduledDigestForAllVineyards(
  asOf: Date = new Date(),
): Promise<ScheduledDigestResult[]> {
  const vineyards = await prisma.vineyard.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  const results: ScheduledDigestResult[] = [];
  for (const vineyard of vineyards) {
    try {
      results.push(await runScheduledDigest(vineyard.id, asOf));
    } catch (error) {
      console.error(`[digest] ${vineyard.name}: run failed`, mailErrorMessage(error));
    }
  }
  return results;
}

export type TestDigestResult = {
  to: string;
  subject: string;
  messageId: string;
  logId: string;
  weekStart: string;
};

/**
 * POST /digest/send-test. Sends exactly one email and logs kind=test.
 * 400 RECIPIENT_LOCAL for *.local, 400 RECIPIENT_NOT_ALLOWED when not on
 * DIGEST_TEST_RECIPIENTS, 502 MAIL_SEND_FAILED (logged failed) on SMTP failure.
 */
export async function sendTestDigest(input: {
  vineyardId: string;
  caller: PublicUser;
  to?: string;
  asOf?: Date;
}): Promise<TestDigestResult> {
  const to = (input.to ?? input.caller.email).trim();
  const normalized = to.toLowerCase();

  if (isLocalAddress(normalized)) {
    throw new HttpError(
      400,
      "RECIPIENT_LOCAL",
      `${to} is a *.local demo address and can't receive email. Pass "to" in the body with an address on DIGEST_TEST_RECIPIENTS.`,
    );
  }
  if (!config.digestTestRecipients.includes(normalized)) {
    throw new HttpError(
      400,
      "RECIPIENT_NOT_ALLOWED",
      `${to} is not on DIGEST_TEST_RECIPIENTS. Test digests only go to allow-listed addresses.`,
    );
  }

  const asOf = input.asOf ?? new Date();
  const weekStart = digestWeekStart(asOf);
  const data = await buildDigestData(input.vineyardId, asOf);
  const rendered = render(data);

  const base = {
    vineyardId: input.vineyardId,
    userId: input.caller.id,
    recipientEmail: to,
    weekStart: weekStartDate(weekStart),
    kind: "test" as const,
  };

  let failure: string;
  try {
    const mail = await sendMail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });
    if (mail.sent) {
      const log = await prisma.digestLog.create({
        data: { ...base, status: "sent", providerMessageId: mail.messageId || null, sentAt: new Date() },
        select: { id: true },
      });
      return { to, subject: rendered.subject, messageId: mail.messageId, logId: log.id, weekStart };
    }
    failure = mail.reason === "local_address" ? LOCAL_SKIP_REASON : NOT_CONFIGURED_REASON;
  } catch (error) {
    failure = mailErrorMessage(error);
    console.error(`[digest] test send to ${to} failed: ${failure}`);
  }

  const log = await prisma.digestLog.create({
    data: { ...base, status: "failed", error: failure },
    select: { id: true },
  });
  throw new HttpError(
    502,
    "MAIL_SEND_FAILED",
    `The test digest could not be sent (${failure}). Logged as DigestLog ${log.id}.`,
  );
}
