import { API_PREFIX } from "@vineyard/shared";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ApiHealth = {
  status: string;
  service: string;
  timestamp: string;
};

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let code = "HTTP_ERROR";
    let message = response.statusText;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // keep status text
    }
    throw new ApiError(code, message);
  }

  return (await response.json()) as T;
}

export function getApiHealth(): Promise<ApiHealth> {
  return apiJson<ApiHealth>("/health");
}
