import {
  API_PREFIX,
  type Activity,
  type ActivityScope,
  type ActivitySource,
  type ActivityType,
  type AuthSession,
  type Harvest,
  type PublicUser,
  type Row,
  type ScheduledTask,
  type TaskStatus,
  type RowLayout,
  type HealthThresholds,
  type Vineyard,
  type VineyardHealth,
  type VineyardMetrics,
  type MetricsPeriod,
} from "@vineyard/shared";

const apiBase = (import.meta.env.VITE_API_URL ?? API_PREFIX).replace(
  /\/$/,
  "",
);

const AUTH_TOKEN_KEY = "vineyard.auth.token";

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

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
  const token = getAuthToken();
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  return (await response.json()) as T;
}

async function throwApiError(response: Response, path: string): Promise<never> {
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
  if (response.status === 401 && path !== "/auth/login") {
    clearAuthToken();
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }
  throw new ApiError(code, message);
}

export function getApiHealth(): Promise<ApiHealth> {
  return apiJson<ApiHealth>("/health");
}

export async function login(
  email: string,
  password: string,
): Promise<AuthSession> {
  const body = await apiJson<{ data: AuthSession }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return body.data;
}

export async function logout(): Promise<void> {
  await apiJson<{ data: { ok: true } }>("/auth/logout", { method: "POST" });
}

export async function getCurrentUser(): Promise<PublicUser> {
  const body = await apiJson<{ data: PublicUser }>("/auth/me");
  return body.data;
}

export async function listVineyards(): Promise<Vineyard[]> {
  const body = await apiJson<ListResponse<Vineyard>>("/vineyards");
  return body.data;
}

export type VineyardWritePayload = {
  name: string;
  address: string;
  timezone: string;
  rowLayout?: RowLayout | null;
  healthThresholds?: HealthThresholds;
  varietyCatalog?: string[];
};

export async function createVineyard(
  payload: VineyardWritePayload,
): Promise<Vineyard> {
  const body = await apiJson<{ data: Vineyard }>("/vineyards", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateVineyard(
  vineyardId: string,
  payload: Partial<VineyardWritePayload>,
): Promise<Vineyard> {
  const body = await apiJson<{ data: Vineyard }>(`/vineyards/${vineyardId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function seedVineyardCalendar(vineyardId: string): Promise<{
  created: number;
  skipped: number;
}> {
  const body = await apiJson<{
    data: { created: number; skipped: number };
  }>(`/vineyards/${vineyardId}/schedule/seed`, { method: "POST" });
  return body.data;
}

export async function uploadVineyardLogo(
  vineyardId: string,
  file: File,
): Promise<Vineyard> {
  const token = getAuthToken();
  const form = new FormData();
  form.append("file", file);
  const path = `/vineyards/${vineyardId}/logo`;
  const response = await fetch(`${apiBase}${path}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  if (!response.ok) {
    await throwApiError(response, path);
  }
  const body = (await response.json()) as { data: Vineyard };
  return body.data;
}

export async function deleteVineyardLogo(vineyardId: string): Promise<Vineyard> {
  const body = await apiJson<{ data: Vineyard }>(
    `/vineyards/${vineyardId}/logo`,
    { method: "DELETE" },
  );
  return body.data;
}

export async function fetchVineyardLogoBlob(vineyardId: string): Promise<Blob> {
  const token = getAuthToken();
  const path = `/vineyards/${vineyardId}/logo`;
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Accept: "image/*",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    await throwApiError(response, path);
  }
  return response.blob();
}

export async function getVineyardHealth(
  vineyardId: string,
): Promise<VineyardHealth> {
  const body = await apiJson<{ data: VineyardHealth }>(
    `/vineyards/${vineyardId}/health`,
  );
  return body.data;
}

export async function getVineyardMetrics(
  vineyardId: string,
  period: MetricsPeriod,
): Promise<VineyardMetrics> {
  const params = new URLSearchParams({ period });
  const body = await apiJson<{ data: VineyardMetrics }>(
    `/vineyards/${vineyardId}/metrics?${params.toString()}`,
  );
  return body.data;
}

export async function listRows(vineyardId: string): Promise<Row[]> {
  const body = await apiJson<ListResponse<Row>>(
    `/vineyards/${vineyardId}/rows`,
  );
  return body.data;
}

export type RowWritePayload = {
  code: string;
  name: string;
  variety: string;
  lengthFeet: number;
  lengthInches: number;
  vineCount: number;
  plantedYear: number;
  status: Row["status"];
  notes?: string;
};

export async function createRow(
  vineyardId: string,
  payload: RowWritePayload,
): Promise<Row> {
  const body = await apiJson<{ data: Row }>(`/vineyards/${vineyardId}/rows`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateRow(
  vineyardId: string,
  rowId: string,
  payload: RowWritePayload,
): Promise<Row> {
  const body = await apiJson<{ data: Row }>(
    `/vineyards/${vineyardId}/rows/${rowId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
  return body.data;
}

export type TaskWritePayload = {
  rowId?: string | null;
  type: ScheduledTask["type"];
  title: string;
  body?: string;
  dueAt: string;
  status: TaskStatus;
  relatedActivityType?: ScheduledTask["relatedActivityType"];
};

export async function listTasks(vineyardId: string): Promise<ScheduledTask[]> {
  const body = await apiJson<ListResponse<ScheduledTask>>(
    `/vineyards/${vineyardId}/tasks`,
  );
  return body.data;
}

export async function createTask(
  vineyardId: string,
  payload: TaskWritePayload,
): Promise<ScheduledTask> {
  const body = await apiJson<{ data: ScheduledTask }>(
    `/vineyards/${vineyardId}/tasks`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return body.data;
}

export async function updateTask(
  vineyardId: string,
  taskId: string,
  payload: Partial<TaskWritePayload>,
): Promise<ScheduledTask> {
  const body = await apiJson<{ data: ScheduledTask }>(
    `/vineyards/${vineyardId}/tasks/${taskId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
  return body.data;
}

export type HarvestWritePayload = {
  rowId: string;
  harvestedAt: string;
  yieldAmount: number;
  yieldUnit: Harvest["yieldUnit"];
  notes?: string;
  crew?: string;
};

export async function listHarvests(rowId?: string): Promise<Harvest[]> {
  const query = rowId ? `?rowId=${encodeURIComponent(rowId)}` : "";
  const body = await apiJson<ListResponse<Harvest>>(`/harvests${query}`);
  return body.data;
}

export async function createHarvest(
  payload: HarvestWritePayload,
): Promise<Harvest> {
  const body = await apiJson<{ data: Harvest }>("/harvests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateHarvest(
  harvestId: string,
  payload: Partial<HarvestWritePayload>,
): Promise<Harvest> {
  const body = await apiJson<{ data: Harvest }>(`/harvests/${harvestId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function deleteHarvest(harvestId: string): Promise<void> {
  await apiJson<{ data: Harvest }>(`/harvests/${harvestId}`, {
    method: "DELETE",
  });
}

export type ActivityWritePayload = {
  scopeType: ActivityScope;
  scopeId: string;
  activityType: ActivityType;
  performedAt?: string;
  details?: Record<string, unknown>;
  source?: ActivitySource;
};

export async function listActivities(
  vineyardId: string,
  filters?: { rowId?: string; activityType?: ActivityType; scopeType?: ActivityScope },
): Promise<Activity[]> {
  const params = new URLSearchParams();
  if (filters?.rowId) params.set("rowId", filters.rowId);
  if (filters?.activityType) params.set("activityType", filters.activityType);
  if (filters?.scopeType) params.set("scopeType", filters.scopeType);
  const query = params.toString();
  const body = await apiJson<ListResponse<Activity>>(
    `/vineyards/${vineyardId}/activities${query ? `?${query}` : ""}`,
  );
  return body.data;
}

export async function createActivity(
  vineyardId: string,
  payload: ActivityWritePayload,
): Promise<Activity> {
  const body = await apiJson<{ data: Activity }>(
    `/vineyards/${vineyardId}/activities`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return body.data;
}

export async function deleteActivity(id: string): Promise<void> {
  await apiJson<{ data: Activity }>(`/activities/${id}`, {
    method: "DELETE",
  });
}
