import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { ApiErrorBody } from "@vineyard/shared";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function isJsonSyntaxError(err: unknown): boolean {
  return (
    err instanceof SyntaxError &&
    "status" in err &&
    (err as { status?: unknown }).status === 400
  );
}

const SAFE_ERROR_NAME_ALLOWLIST = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientValidationError",
  "PrismaClientInitializationError",
  "PrismaClientRustPanicError",
]);

function extractSafeErrorCode(err: unknown): string {
  if (err === null || typeof err !== "object") return "INTERNAL_ERROR";
  const raw = (err as { code?: unknown }).code;
  if (typeof raw !== "string") return "INTERNAL_ERROR";
  if (/^P\d{4}$/.test(raw)) return raw;
  if (/^[0-9A-Z]{5}$/.test(raw)) return raw;
  if (/^E[A-Z0-9_]{2,24}$/.test(raw)) return raw;
  return "INTERNAL_ERROR";
}

function extractSafeErrorName(err: unknown): string {
  if (!(err instanceof Error)) return "UnknownError";
  return SAFE_ERROR_NAME_ALLOWLIST.has(err.name) ? err.name : "Error";
}

function extractRequestId(req: Request): string {
  const header = req.headers["x-request-id"];
  const raw = typeof header === "string" ? header.trim() : "";
  if (/^[A-Za-z0-9_-]{1,64}$/.test(raw)) return raw;
  return randomUUID().slice(0, 8);
}

/**
 * Sanitized route string for 500 logs: prefers Express route template, strips
 * query strings, and replaces UUIDs/emails/URLs so no user values leak.
 */
function sanitizeRoute(req: Request): string {
  const routePath =
    req.route && typeof (req.route as { path?: unknown }).path === "string"
      ? `${req.baseUrl}${(req.route as { path: string }).path}`
      : req.path;
  return (routePath || "/")
    .split("?")[0]!
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ":id",
    )
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

export function formatInternalErrorLog(err: unknown, req: Request): string {
  const requestId = extractRequestId(req);
  const method = (req.method || "UNKNOWN").toUpperCase().replace(/[^A-Z]/g, "");
  const route = sanitizeRoute(req);
  const name = extractSafeErrorName(err);
  const code = extractSafeErrorCode(err);
  return `[api] 500 ${method} ${route} req=${requestId} err=${name} code=${code}`;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response<ApiErrorBody>,
  _next: NextFunction,
): void {
  if (isJsonSyntaxError(err)) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid JSON request body",
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: err.issues.map((issue) => issue.message).join("; "),
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  console.error(formatInternalErrorLog(err, req));
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
  });
}
