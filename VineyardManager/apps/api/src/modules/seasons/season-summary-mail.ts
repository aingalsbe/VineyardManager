import type { Prisma, PrismaClient } from "@prisma/client";
import type { SeasonSummary } from "@vineyard/shared";
import { config } from "../../config.js";
import { prisma } from "../../db/prisma.js";
import { formatLb } from "../../lib/format-number.js";
import {
  isLocalAddress,
  sendMail,
  type MailMessage,
  type MailResult,
} from "../../lib/mailer.js";
import {
  COLOR,
  FALLBACK_HEALTH_TONE,
  FONT,
  HEALTH_TONE,
  RESPONSIVE_CSS,
  WRAP,
} from "../digest/digest.styles.js";

export type SeasonSummaryMailMode = "test" | "live";

export const ALLOWED_SUMMARY_MAIL_ERROR_CODES = new Set<string>([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNECTION",
  "EAUTH",
  "ESOCKET",
  "EENVELOPE",
  "EMESSAGE",
  "ETLS",
  "EDNS",
  "ERATELIMIT",
  "EHTTP",
  "MAIL_NOT_CONFIGURED",
  "LOCAL_ADDRESS",
  "TEST_MODE_FILTERED",
  "SUMMARY_MISSING",
  "SEND_FAILED",
]);

export const DEFAULT_MAX_SUMMARY_MAIL_ATTEMPTS = 3;
export const DEFAULT_RETRY_BACKOFF_MS: readonly number[] = [0, 30_000, 120_000];

/**
 * Map any transport error to a fixed allowlisted error code (C6, §5.1).
 * Never returns raw provider messages, recipient addresses, URLs, or tokens.
 */
export function allowlistMailErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const raw = (error as { code?: unknown }).code;
    if (typeof raw === "string") {
      const upper = raw.trim().toUpperCase();
      if (ALLOWED_SUMMARY_MAIL_ERROR_CODES.has(upper)) return upper;
    }
  }
  return "SEND_FAILED";
}

export type RecipientCandidate = {
  id: string;
  email: string;
  role: string;
  disabledAt?: Date | null;
  deletedAt?: Date | null;
  notificationPrefs: unknown;
};

export type PlannedMailIntent = {
  userId: string;
  recipientEmail: string;
  status: "pending" | "skipped";
  lastErrorCode: string | null;
};

/**
 * Master emailEnabled check for Season Summary emails (C5, D-07).
 * Turning off weeklyDigest does NOT stop Season Summary emails — only emailEnabled === false does.
 */
export function wantsSeasonSummaryEmail(notificationPrefs: unknown): boolean {
  if (!notificationPrefs || typeof notificationPrefs !== "object") return true;
  const prefs = notificationPrefs as { emailEnabled?: unknown };
  return prefs.emailEnabled !== false;
}

/**
 * Select Season Summary recipients and classify pending vs skipped (C5, D-07, D-09).
 * - Eligible roles: live, enabled power_user and manager with emailEnabled !== false.
 * - In "test" mode (default), any address not in testAllowlist is recorded as status="skipped"
 *   with lastErrorCode="TEST_MODE_FILTERED".
 * - *.local addresses are recorded as status="skipped" with lastErrorCode="LOCAL_ADDRESS".
 */
export function selectSeasonSummaryRecipients(
  candidates: RecipientCandidate[],
  options: {
    mode: SeasonSummaryMailMode;
    testAllowlist: readonly string[];
  },
): PlannedMailIntent[] {
  const allowSet = new Set(
    options.testAllowlist.map((e) => e.trim().toLowerCase()).filter(Boolean),
  );
  const seenEmails = new Set<string>();
  const intents: PlannedMailIntent[] = [];

  for (const user of candidates) {
    if (user.deletedAt != null || user.disabledAt != null) continue;
    if (user.role !== "power_user" && user.role !== "manager") continue;
    if (!wantsSeasonSummaryEmail(user.notificationPrefs)) continue;

    const email = user.email.trim().toLowerCase();
    if (!email || seenEmails.has(email)) continue;
    seenEmails.add(email);

    if (isLocalAddress(email)) {
      intents.push({
        userId: user.id,
        recipientEmail: email,
        status: "skipped",
        lastErrorCode: "LOCAL_ADDRESS",
      });
    } else if (options.mode === "test" && !allowSet.has(email)) {
      intents.push({
        userId: user.id,
        recipientEmail: email,
        status: "skipped",
        lastErrorCode: "TEST_MODE_FILTERED",
      });
    } else {
      intents.push({
        userId: user.id,
        recipientEmail: email,
        status: "pending",
        lastErrorCode: null,
      });
    }
  }

  return intents;
}

/**
 * Write mail intents inside the season close transaction (C4, C5).
 * Unique per (seasonId, closeVersion, recipientEmail); skipDuplicates prevents
 * duplicate rows on retry.
 */
export async function enqueueSeasonSummaryMailIntents(
  tx: Prisma.TransactionClient,
  input: {
    vineyardId: string;
    seasonId: string;
    closeVersion: number;
    mode?: SeasonSummaryMailMode;
    testAllowlist?: readonly string[];
  },
): Promise<{ enqueued: number; skipped: number }> {
  const candidates = await tx.user.findMany({
    where: {
      deletedAt: null,
      disabledAt: null,
      role: { in: ["power_user", "manager"] },
    },
    select: {
      id: true,
      email: true,
      role: true,
      disabledAt: true,
      deletedAt: true,
      notificationPrefs: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const planned = selectSeasonSummaryRecipients(candidates, {
    mode: input.mode ?? config.seasonSummaryMailMode,
    testAllowlist: input.testAllowlist ?? config.digestTestRecipients,
  });

  if (planned.length === 0) {
    return { enqueued: 0, skipped: 0 };
  }

  await tx.seasonSummaryMail.createMany({
    data: planned.map((item) => ({
      seasonId: input.seasonId,
      vineyardId: input.vineyardId,
      closeVersion: input.closeVersion,
      userId: item.userId,
      recipientEmail: item.recipientEmail,
      status: item.status,
      attempts: 0,
      lastErrorCode: item.lastErrorCode,
    })),
    skipDuplicates: true,
  });

  return {
    enqueued: planned.filter((i) => i.status === "pending").length,
    skipped: planned.filter((i) => i.status === "skipped").length,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatIsoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export type RenderedSeasonSummaryEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Render HTML + plain text Season Summary email (C3, H4).
 * Reuses digest.styles.ts tokens: blue primary chrome, health colors ONLY on the health pill.
 * Content matches the Past Seasons detail page section-for-section.
 */
export function renderSeasonSummaryEmail(
  summary: SeasonSummary,
  appUrl: string = config.appUrl,
): RenderedSeasonSummaryEmail {
  const base = appUrl.replace(/\/$/, "");
  const detailUrl = `${base}/seasons/${summary.seasonId}`;
  const prefsUrl = `${base}/settings#notifications`;
  const subject = `${summary.vineyardName} — ${summary.year} Season Summary`;
  const tone = HEALTH_TONE[summary.health.color] ?? FALLBACK_HEALTH_TONE;

  const deltaLabel =
    summary.harvests.deltaPct !== null && summary.harvests.previousSeasonYear !== null
      ? `${summary.harvests.deltaPct > 0 ? "+" : ""}${summary.harvests.deltaPct}% vs ${summary.harvests.previousSeasonYear} (${formatLb(summary.harvests.previousTotalLb)})`
      : null;

  const positivesHtml =
    summary.positives.length > 0
      ? summary.positives
          .map(
            (p) =>
              `<li style="margin:0 0 6px 0;${WRAP}">${escapeHtml(p.text)}</li>`,
          )
          .join("")
      : `<li style="margin:0;color:${COLOR.muted};">None highlighted this season.</li>`;

  const negativesHtml =
    summary.negatives.length > 0
      ? summary.negatives
          .map(
            (n) =>
              `<li style="margin:0 0 6px 0;${WRAP}">${escapeHtml(n.text)}</li>`,
          )
          .join("")
      : `<li style="margin:0;color:${COLOR.muted};">No issues flagged this season.</li>`;

  const varietyRowsHtml =
    summary.harvests.byVariety.length > 0
      ? summary.harvests.byVariety
          .map((v) => {
            const cmp =
              v.previousTotalLb !== null
                ? ` (prev: ${formatLb(v.previousTotalLb)}${v.deltaPct !== null ? `, ${v.deltaPct > 0 ? "+" : ""}${v.deltaPct}%` : ""})`
                : "";
            return `<tr><td style="padding:6px 8px;border-bottom:1px solid ${COLOR.border};${WRAP}">${escapeHtml(v.variety)}</td><td style="padding:6px 8px;border-bottom:1px solid ${COLOR.border};text-align:right;font-weight:600;">${formatLb(v.totalLb)}${escapeHtml(cmp)}</td></tr>`;
          })
          .join("")
      : `<tr><td colspan="2" style="padding:8px;color:${COLOR.muted};">No pound harvests recorded.</td></tr>`;

  const rowRowsHtml =
    summary.harvests.byRow.length > 0
      ? summary.harvests.byRow
          .map((r) => {
            const cmp =
              r.previousTotalLb !== null ? ` (prev: ${formatLb(r.previousTotalLb)})` : "";
            return `<tr><td style="padding:6px 8px;border-bottom:1px solid ${COLOR.border};${WRAP}">${escapeHtml(r.code)} · ${escapeHtml(r.variety)}</td><td style="padding:6px 8px;border-bottom:1px solid ${COLOR.border};text-align:right;font-weight:600;">${formatLb(r.totalLb)}${escapeHtml(cmp)}</td></tr>`;
          })
          .join("")
      : "";

  const dismissedListHtml =
    summary.tasks.dismissedByCloseList.length > 0
      ? `<p style="margin:12px 0 6px 0;font-size:13px;font-weight:600;color:${COLOR.ink};">Dismissed when closing (${summary.tasks.dismissedByClose}):</p><ul style="margin:0;padding-left:18px;font-size:13px;color:${COLOR.muted};">${summary.tasks.dismissedByCloseList
          .map(
            (t) =>
              `<li style="margin:0 0 4px 0;${WRAP}">${escapeHtml(t.title)} (due ${escapeHtml(t.dueDate)}${t.rowCode ? ` · ${escapeHtml(t.rowCode)}` : ""})</li>`,
          )
          .join("")}</ul>`
      : "";

  const monthlyTrendHtml =
    summary.health.monthlyTrend && summary.health.monthlyTrend.length > 0
      ? `<p style="margin:10px 0 0 0;font-size:13px;color:${COLOR.muted};">Monthly trend: ${summary.health.monthlyTrend
          .map((pt) => `${escapeHtml(pt.month)} ${pt.score}`)
          .join(" · ")}</p>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
<style>${RESPONSIVE_CSS}</style>
</head>
<body style="margin:0;padding:0;background:${COLOR.page};color:${COLOR.ink};font-family:${FONT};line-height:1.5;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="vm-outer" style="background:${COLOR.page};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" class="vm-card" style="max-width:600px;width:100%;background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:12px;overflow:hidden;">
<tr><td class="vm-px" style="background:${COLOR.primary};color:${COLOR.onPrimary};padding:24px;">
  <p style="margin:0;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${COLOR.onPrimarySoft};">Season Summary</p>
  <h1 class="vm-h1" style="margin:6px 0 4px 0;font-size:24px;line-height:30px;font-weight:700;${WRAP}">${escapeHtml(summary.vineyardName)} — ${summary.year}</h1>
  <p style="margin:0;font-size:14px;color:${COLOR.onPrimarySoft};">Closed ${escapeHtml(formatIsoDate(summary.closedAt))}</p>
</td></tr>

<tr><td class="vm-px" style="padding:20px 24px;border-bottom:1px solid ${COLOR.border};">
  <h2 style="margin:0 0 10px 0;font-size:16px;font-weight:700;color:${COLOR.ink};">Health at close</h2>
  <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${tone.bg};color:${tone.fg};font-weight:700;font-size:14px;text-transform:capitalize;">${escapeHtml(summary.health.color)} ${summary.health.score} — ${escapeHtml(tone.label)}</span>
  ${monthlyTrendHtml}
</td></tr>

<tr><td class="vm-px" style="padding:20px 24px;border-bottom:1px solid ${COLOR.border};background:${COLOR.tint};">
  <h2 style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:${COLOR.ink};">What went well</h2>
  <ul style="margin:0 0 14px 0;padding-left:18px;font-size:14px;">${positivesHtml}</ul>
  <h2 style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:${COLOR.ink};">What to watch next year</h2>
  <ul style="margin:0;padding-left:18px;font-size:14px;">${negativesHtml}</ul>
</td></tr>

<tr><td class="vm-px" style="padding:20px 24px;border-bottom:1px solid ${COLOR.border};">
  <h2 style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:${COLOR.ink};">Harvest</h2>
  <p style="margin:0 0 10px 0;font-size:18px;font-weight:700;color:${COLOR.ink};">${formatLb(summary.harvests.totalLb)} total${deltaLabel ? ` <span style="font-size:14px;font-weight:400;color:${COLOR.muted};">(${escapeHtml(deltaLabel)})</span>` : ""}</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;border-collapse:collapse;">
    ${varietyRowsHtml}
    ${rowRowsHtml}
  </table>
</td></tr>

<tr><td class="vm-px" style="padding:20px 24px;border-bottom:1px solid ${COLOR.border};">
  <h2 style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:${COLOR.ink};">Work logged</h2>
  <p style="margin:0;font-size:14px;color:${COLOR.ink};">Waterings: <strong>${summary.work.waterings}</strong> · Fertilizing: <strong>${summary.work.fertilizing}</strong> · Pest treatments: <strong>${summary.work.pestTreatments}</strong> · Weed treatments: <strong>${summary.work.weedTreatments}</strong></p>
</td></tr>

<tr><td class="vm-px" style="padding:20px 24px;border-bottom:1px solid ${COLOR.border};">
  <h2 style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:${COLOR.ink};">Tasks</h2>
  <p style="margin:0;font-size:14px;color:${COLOR.ink};">Done on time: <strong>${summary.tasks.doneOnTime}</strong> · Done late: <strong>${summary.tasks.doneLate}</strong>${summary.tasks.onTimePct !== null ? ` (${summary.tasks.onTimePct}% on time)` : ""} · Dismissed earlier: <strong>${summary.tasks.dismissedBeforeClose}</strong>${summary.tasks.dismissedByEarlierClose ? ` · Dismissed by an earlier close: <strong>${summary.tasks.dismissedByEarlierClose}</strong>` : ""} · Dismissed at close: <strong>${summary.tasks.dismissedByClose}</strong></p>
  ${dismissedListHtml}
</td></tr>

<tr><td class="vm-px" style="padding:20px 24px;border-bottom:1px solid ${COLOR.border};">
  <h2 style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:${COLOR.ink};">Notable weather</h2>
  <p style="margin:0;font-size:14px;color:${COLOR.ink};${WRAP}">${escapeHtml(summary.weather.note)}</p>
</td></tr>

<tr><td class="vm-px" style="padding:20px 24px;text-align:center;">
  <a href="${escapeHtml(detailUrl)}" rel="noopener noreferrer" style="display:inline-block;padding:10px 18px;border-radius:8px;background:${COLOR.primary};color:${COLOR.onPrimary};text-decoration:none;font-weight:600;font-size:14px;">View in Vineyard Manager</a>
  <p style="margin:14px 0 0 0;font-size:12px;color:${COLOR.muted};">
    <a href="${escapeHtml(prefsUrl)}" rel="noopener noreferrer" style="color:${COLOR.primary};">Change email preferences</a>
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textLines: string[] = [
    `${summary.vineyardName} — ${summary.year} Season Summary`,
    `Closed ${formatIsoDate(summary.closedAt)}`,
    "",
    `Health at close: ${summary.health.color} ${summary.health.score}`,
    ...(summary.health.monthlyTrend && summary.health.monthlyTrend.length > 0
      ? [
          `Monthly trend: ${summary.health.monthlyTrend
            .map((pt) => `${pt.month} ${pt.score}`)
            .join(", ")}`,
        ]
      : []),
    "",
    "What went well:",
    ...(summary.positives.length > 0
      ? summary.positives.map((p) => `- ${p.text}`)
      : ["- None highlighted this season."]),
    "",
    "What to watch next year:",
    ...(summary.negatives.length > 0
      ? summary.negatives.map((n) => `- ${n.text}`)
      : ["- No issues flagged this season."]),
    "",
    `Harvest: ${formatLb(summary.harvests.totalLb)} total${deltaLabel ? ` (${deltaLabel})` : ""}`,
    ...summary.harvests.byVariety.map(
      (v) =>
        `  ${v.variety}: ${formatLb(v.totalLb)}${v.previousTotalLb !== null ? ` (prev ${formatLb(v.previousTotalLb)})` : ""}`,
    ),
    ...summary.harvests.byRow.map(
      (r) =>
        `  ${r.code} (${r.variety}): ${formatLb(r.totalLb)}${r.previousTotalLb !== null ? ` (prev ${formatLb(r.previousTotalLb)})` : ""}`,
    ),
    "",
    `Work logged: ${summary.work.waterings} waterings, ${summary.work.fertilizing} fertilizing, ${summary.work.pestTreatments} pest treatments, ${summary.work.weedTreatments} weed treatments`,
    `Tasks: ${summary.tasks.doneOnTime} on time, ${summary.tasks.doneLate} late${summary.tasks.onTimePct !== null ? ` (${summary.tasks.onTimePct}%)` : ""}, ${summary.tasks.dismissedBeforeClose} dismissed earlier, ${summary.tasks.dismissedByEarlierClose ? `${summary.tasks.dismissedByEarlierClose} dismissed by an earlier close, ` : ""}${summary.tasks.dismissedByClose} dismissed at close`,
    ...summary.tasks.dismissedByCloseList.map(
      (t) =>
        `  - Dismissed at close: ${t.title} (due ${t.dueDate}${t.rowCode ? `, ${t.rowCode}` : ""})`,
    ),
    "",
    `Notable weather: ${summary.weather.note}`,
    "",
    `View in Vineyard Manager: ${detailUrl}`,
    `Change email preferences: ${prefsUrl}`,
  ];

  return { subject, html, text: textLines.join("\n") };
}

function findSummaryForCloseVersion(
  season: { closeVersion: number; summary: unknown; summaryHistory: unknown },
  closeVersion: number,
): SeasonSummary | null {
  if (
    season.closeVersion === closeVersion &&
    season.summary &&
    typeof season.summary === "object" &&
    !Array.isArray(season.summary)
  ) {
    return season.summary as SeasonSummary;
  }
  if (Array.isArray(season.summaryHistory)) {
    for (let i = season.summaryHistory.length - 1; i >= 0; i -= 1) {
      const entry = season.summaryHistory[i];
      if (
        entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        (entry as { closeVersion?: unknown }).closeVersion === closeVersion
      ) {
        return entry as SeasonSummary;
      }
    }
  }
  if (
    season.summary &&
    typeof season.summary === "object" &&
    !Array.isArray(season.summary)
  ) {
    return season.summary as SeasonSummary;
  }
  return null;
}

const nextRetryAtMs = new Map<string, number>();

export function resetSummaryMailBackoffForTests(): void {
  nextRetryAtMs.clear();
}

export type DispatchSeasonSummaryMailOptions = {
  db?: PrismaClient;
  transport?: (message: MailMessage) => Promise<MailResult>;
  appUrl?: string;
  now?: () => Date;
  maxAttempts?: number;
  backoffMs?: readonly number[];
  logger?: (line: string) => void;
};

export type DispatchSeasonSummaryMailResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  deferredByBackoff: number;
};

/**
 * After-commit dispatcher for season_summary_mails (C4, C6).
 *
 * Delivery semantics (C4):
 * - Bounded retries (default max 3 attempts) with per-attempt backoff.
 * - Failures leave the season closed and never roll back or reopen it.
 * - A lost provider acknowledgement (e.g. ETIMEDOUT after the provider accepted the message)
 *   will mark the intent `failed` and retry on a later pass, which may cause a duplicate
 *   delivery; at-least-once delivery is guaranteed, not exactly-once.
 * - Logs contain ONLY intentId, seasonId, closeVersion, status, attempts, and allowlisted code
 *   — never recipient addresses, links, tokens, provider text, or summary numbers (C6).
 */
export async function dispatchPendingSeasonSummaryMails(
  options: DispatchSeasonSummaryMailOptions = {},
): Promise<DispatchSeasonSummaryMailResult> {
  const db = options.db ?? prisma;
  const transport = options.transport ?? sendMail;
  const appUrl = options.appUrl ?? config.appUrl;
  const nowFn = options.now ?? (() => new Date());
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_SUMMARY_MAIL_ATTEMPTS;
  const backoffMs = options.backoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  const logger = options.logger ?? ((line: string) => console.info(line));

  const intents = await db.seasonSummaryMail.findMany({
    where: {
      OR: [
        { status: "pending" },
        { status: "failed", attempts: { lt: maxAttempts } },
      ],
    },
    include: {
      season: {
        select: {
          closeVersion: true,
          summary: true,
          summaryHistory: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
    take: 50,
  });

  const result: DispatchSeasonSummaryMailResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    deferredByBackoff: 0,
  };

  for (const intent of intents) {
    const now = nowFn();
    const retryAfter = nextRetryAtMs.get(intent.id) ?? 0;
    if (intent.status === "failed" && now.getTime() < retryAfter) {
      result.deferredByBackoff += 1;
      continue;
    }

    result.processed += 1;
    const nextAttempts = intent.attempts + 1;
    const summary = findSummaryForCloseVersion(intent.season, intent.closeVersion);

    if (!summary) {
      await db.seasonSummaryMail.update({
        where: { id: intent.id },
        data: {
          status: "skipped",
          attempts: nextAttempts,
          lastErrorCode: "SUMMARY_MISSING",
        },
      });
      nextRetryAtMs.delete(intent.id);
      result.skipped += 1;
      logger(
        `season_summary_mail intent=${intent.id} season=${intent.seasonId} closeVersion=${intent.closeVersion} status=skipped attempts=${nextAttempts} code=SUMMARY_MISSING`,
      );
      continue;
    }

    const rendered = renderSeasonSummaryEmail(summary, appUrl);
    try {
      const sendRes = await transport({
        to: intent.recipientEmail,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });

      if (sendRes.sent) {
        await db.seasonSummaryMail.update({
          where: { id: intent.id },
          data: {
            status: "sent",
            attempts: nextAttempts,
            sentAt: now,
            providerMessageId: sendRes.messageId || null,
            lastErrorCode: null,
          },
        });
        nextRetryAtMs.delete(intent.id);
        result.sent += 1;
        logger(
          `season_summary_mail intent=${intent.id} season=${intent.seasonId} closeVersion=${intent.closeVersion} status=sent attempts=${nextAttempts} code=none`,
        );
      } else if (sendRes.reason === "local_address") {
        await db.seasonSummaryMail.update({
          where: { id: intent.id },
          data: {
            status: "skipped",
            attempts: nextAttempts,
            lastErrorCode: "LOCAL_ADDRESS",
          },
        });
        nextRetryAtMs.delete(intent.id);
        result.skipped += 1;
        logger(
          `season_summary_mail intent=${intent.id} season=${intent.seasonId} closeVersion=${intent.closeVersion} status=skipped attempts=${nextAttempts} code=LOCAL_ADDRESS`,
        );
      } else {
        const delay = backoffMs[Math.min(nextAttempts, backoffMs.length - 1)] ?? 30_000;
        nextRetryAtMs.set(intent.id, now.getTime() + delay);
        await db.seasonSummaryMail.update({
          where: { id: intent.id },
          data: {
            status: "failed",
            attempts: nextAttempts,
            lastErrorCode: "MAIL_NOT_CONFIGURED",
          },
        });
        result.failed += 1;
        logger(
          `season_summary_mail intent=${intent.id} season=${intent.seasonId} closeVersion=${intent.closeVersion} status=failed attempts=${nextAttempts} code=MAIL_NOT_CONFIGURED`,
        );
      }
    } catch (error) {
      const code = allowlistMailErrorCode(error);
      const delay = backoffMs[Math.min(nextAttempts, backoffMs.length - 1)] ?? 30_000;
      nextRetryAtMs.set(intent.id, now.getTime() + delay);
      await db.seasonSummaryMail.update({
        where: { id: intent.id },
        data: {
          status: "failed",
          attempts: nextAttempts,
          lastErrorCode: code,
        },
      });
      result.failed += 1;
      logger(
        `season_summary_mail intent=${intent.id} season=${intent.seasonId} closeVersion=${intent.closeVersion} status=failed attempts=${nextAttempts} code=${code}`,
      );
    }
  }

  return result;
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerRunning = false;

async function safeDrain(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await dispatchPendingSeasonSummaryMails();
  } catch {
    console.error("season_summary_mail worker_drain_error code=DRAIN_FAILED");
  } finally {
    workerRunning = false;
  }
}

/**
 * Start the in-process season summary mail drain worker (C4).
 * Drains pending intents on startup and every 60s. Guarded by config.seasonSummaryMailWorkerEnabled.
 */
export function startSeasonSummaryMailWorker(): void {
  if (!config.seasonSummaryMailWorkerEnabled) return;
  if (workerTimer) return;
  void safeDrain();
  workerTimer = setInterval(() => {
    void safeDrain();
  }, 60_000);
  workerTimer.unref();
}

export async function stopSeasonSummaryMailWorker(): Promise<void> {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
