import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";
import { sendViaResend } from "./mail-transports/resend.js";

/**
 * Shared mailer (Resend HTTPS API or nodemailer SMTP). Used by password reset
 * and the weekly digest. Port 465 → secure (implicit TLS). Resend is selected
 * only when MAIL_TRANSPORT=resend and RESEND_API_KEY is set. A missing key
 * falls back once at transport setup; there is no per-message fallback.
 *
 * Safety: never sends to *.local addresses (seed/demo accounts); those return
 * { sent: false, reason: "local_address" } and callers fall back as if mail
 * were off. Never logs credentials.
 */

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: "not_configured" | "local_address" };

const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
} as const;

export function isLocalAddress(email: string): boolean {
  return /\.local$/i.test(email.trim());
}

export function isMailConfigured(): boolean {
  if (config.mailTransport === "resend" && config.resendApiKey) return true;
  return Boolean(config.smtpUrl || config.smtpHost);
}

type CachedTransport =
  | { kind: "resend" }
  | { kind: "smtp"; transport: Transporter };

let cached: CachedTransport | null = null;
let missingResendWarned = false;

function warnMissingResend(fallback: "using smtp" | "not configured"): void {
  if (config.mailTransport !== "resend" || config.resendApiKey) return;
  if (missingResendWarned) return;
  missingResendWarned = true;
  console.warn(`mail transport: resend selected but RESEND_API_KEY missing; ${fallback}`);
}

function getTransport(): CachedTransport | null {
  if (cached) return cached;
  if (config.mailTransport === "resend" && config.resendApiKey) {
    cached = { kind: "resend" };
    return cached;
  }
  if (config.smtpUrl) {
    warnMissingResend("using smtp");
    cached = {
      kind: "smtp",
      transport: nodemailer.createTransport({
        url: config.smtpUrl,
        ...SMTP_TIMEOUTS,
      }),
    };
    return cached;
  }
  if (config.smtpHost) {
    warnMissingResend("using smtp");
    cached = {
      kind: "smtp",
      transport: nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth:
          config.smtpUser || config.smtpPass
            ? { user: config.smtpUser, pass: config.smtpPass }
            : undefined,
        ...SMTP_TIMEOUTS,
      }),
    };
    return cached;
  }
  warnMissingResend("not configured");
  return null;
}

/**
 * Send one message (html + text alternative). Throws on transport errors so callers
 * can log/return 502; returns { sent: false } when not configured or *.local.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (isLocalAddress(message.to)) {
    return { sent: false, reason: "local_address" };
  }
  const transport = getTransport();
  if (!transport) {
    return { sent: false, reason: "not_configured" };
  }
  if (transport.kind === "resend") {
    const info = await sendViaResend(
      {
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html !== undefined ? { html: message.html } : {}),
      },
      {
        apiKey: config.resendApiKey,
        from: config.mailFrom,
        timeoutMs: config.mailTimeoutMs,
      },
    );
    return { sent: true, messageId: info.messageId };
  }
  const info = await transport.transport.sendMail({
    from: config.mailFrom,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
  });
  return { sent: true, messageId: String(info.messageId ?? "") };
}

/** Safe error text for logs/DB: message only, trimmed, no stack/credentials. */
export function mailErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").slice(0, 500);
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<boolean> {
  try {
    const result = await sendMail({
      to,
      subject: "Reset your Vineyard Manager password",
      text: [
        "Reset your Vineyard Manager password with this link:",
        resetUrl,
        "",
        "This link expires in one hour. If you did not ask for a reset, you can ignore this email.",
      ].join("\n"),
    });
    if (!result.sent) {
      console.info(`password reset email not sent: ${result.reason}`);
      return false;
    }
    return true;
  } catch (error) {
    const allowed = [
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
    ] as const;
    const raw =
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "";
    const label = allowed.find((item) => item === raw) ?? "unknown";
    console.error(`password reset email failed: ${label}`);
    return false;
  }
}
