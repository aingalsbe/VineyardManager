import { API_PREFIX, type Block, type Vineyard } from "@vineyard/shared";

const apiBase = (import.meta.env.VITE_API_URL ?? API_PREFIX).replace(
  /\/$/,
  "",
);

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

export type ListResponse<T> = { data: T[] };

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
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

export async function listVineyards(): Promise<Vineyard[]> {
  const body = await apiJson<ListResponse<Vineyard>>("/vineyards");
  return body.data;
}

export async function listBlocks(vineyardId: string): Promise<Block[]> {
  const body = await apiJson<ListResponse<Block>>(
    `/vineyards/${vineyardId}/blocks`,
  );
  return body.data;
}
