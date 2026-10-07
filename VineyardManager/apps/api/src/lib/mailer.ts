import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";

/**
 * Shared mailer (nodemailer + SMTP_*). Used by password reset and the weekly
 * digest. Port 465 → secure (implicit TLS).
 *
 * Safety: never sends to *.local addresses (seed/demo accounts); those return
 * { sent: false, reason: "local_address" } and callers fall back as if SMTP
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

export function isLocalAddress(email: string): boolean {
  return /\.local$/i.test(email.trim());
}

export function isMailConfigured(): boolean {
  return Boolean(config.smtpUrl || config.smtpHost);
}

let cached: Transporter | null = null;

function getTransport(): Transporter | null {
  if (cached) return cached;
  if (config.smtpUrl) {
    cached = nodemailer.createTransport(config.smtpUrl);
    return cached;
  }
  if (config.smtpHost) {
    cached = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth:
        config.smtpUser || config.smtpPass
          ? { user: config.smtpUser, pass: config.smtpPass }
          : undefined,
    });
    return cached;
  }
  return null;
}

/**
 * Send one message (html + text alternative). Throws on SMTP errors so callers
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
  const info = await transport.sendMail({
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
      console.info(`Password reset URL for ${to}: ${resetUrl}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to send password reset email:", mailErrorMessage(error));
    return false;
  }
}
