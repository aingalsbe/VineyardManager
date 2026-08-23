import {
  API_PREFIX,
  type Activity,
  type ActivityScope,
  type ActivitySource,
  type ActivityType,
  type Harvest,
  type Row,
  type ScheduledTask,
  type TaskStatus,
  type Vineyard,
} from "@vineyard/shared";

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
