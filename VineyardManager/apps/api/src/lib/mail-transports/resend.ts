const RESEND_URL = "https://api.resend.com/emails";
const SAFE_NAME = /^[a-z_]{1,40}$/;

export class MailTransportError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "MailTransportError";
    this.code = code;
    if (status !== undefined) {
      this.status = status;
    }
  }
}

export type ResendMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type ResendSendOptions = {
  apiKey: string;
  from: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

function httpCode(status: number): string {
  if (status === 401 || status === 403) return "EAUTH";
  if (status === 400 || status === 422) return "EMESSAGE";
  if (status === 429) return "ERATELIMIT";
  return "EHTTP";
}

function safeName(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_NAME.test(value) ? value : undefined;
}

function isAbortOrTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  return (
    error.cause instanceof Error &&
    (error.cause.name === "AbortError" || error.cause.name === "TimeoutError")
  );
}

async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function sendViaResend(
  message: ResendMessage,
  options: ResendSendOptions,
): Promise<{ messageId: string }> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const body: Record<string, unknown> = {
    from: options.from,
    to: [message.to],
    subject: message.subject,
    text: message.text,
  };
  if (message.html !== undefined) {
    body.html = message.html;
  }

  let response: Response;
  try {
    response = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    if (isAbortOrTimeout(error)) {
      throw new MailTransportError("ETIMEDOUT", "resend timeout");
    }
    throw new MailTransportError("ECONNECTION", "resend network");
  }

  const parsed = await readJsonObject(response);
  if (response.ok) {
    return { messageId: String(parsed?.id ?? "") };
  }

  const name = safeName(parsed?.name);
  const text = name ? `resend ${response.status} ${name}` : `resend ${response.status}`;
  throw new MailTransportError(httpCode(response.status), text, response.status);
}
