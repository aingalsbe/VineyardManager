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

  const name = err instanceof Error ? err.name : typeof err;
  const code =
    err !== null && typeof err === "object" && "code" in err && typeof err.code === "string"
      ? ` code=${err.code}`
      : "";
  const message =
    err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 200) : "unknown";
  console.error(`[api] 500 ${req.method} ${req.path} ${name}${code}: ${message}`);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
  });
}
