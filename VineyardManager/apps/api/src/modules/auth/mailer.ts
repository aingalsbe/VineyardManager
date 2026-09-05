import nodemailer from "nodemailer";
import { config } from "../../config.js";

function createTransport() {
  if (config.smtpUrl) {
    return nodemailer.createTransport(config.smtpUrl);
  }
  if (config.smtpHost) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      auth:
        config.smtpUser || config.smtpPass
          ? { user: config.smtpUser, pass: config.smtpPass }
          : undefined,
    });
  }
  return null;
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<boolean> {
  const transport = createTransport();
  if (!transport) {
    console.info(`Password reset URL for ${to}: ${resetUrl}`);
    return false;
  }

  try {
    await transport.sendMail({
      from: config.mailFrom,
      to,
      subject: "Reset your Vineyard Manager password",
      text: [
        "Reset your Vineyard Manager password with this link:",
        resetUrl,
        "",
        "This link expires in one hour. If you did not ask for a reset, you can ignore this email.",
      ].join("\n"),
    });
    return true;
  } catch (error) {
    console.error("Failed to send password reset email", error);
    return false;
  }
}
