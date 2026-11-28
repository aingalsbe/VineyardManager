import {
  API_PREFIX,
  type Activity,
  type ActivityScope,
  type ActivitySource,
  type ActivityType,
  type AuthSession,
  type CloseSeasonPreview,
  type CloseSeasonResult,
  type CurrentSeasonState,
  type Harvest,
  type NewSeasonPreview,
  type NewSeasonResult,
  type PublicUser,
  type ReopenSeasonResult,
  type Row,
  type ScheduledTask,
  type SeasonDto,
  type TaskStatus,
  type VarietyHarvestTags,
  type RowLayout,
  type HealthThresholds,
  type Vineyard,
  type VineyardHealth,
  type VineyardMetrics,
  type VineyardWeather,
  type MetricsPeriod,
  type RowDeleteOpenTasksAction,
  type RowDeleteOpenTask,
  type RowDeletePreview,
  type RowDeleteResult,
} from "@vineyard/shared";

const apiBase = (import.meta.env.VITE_API_URL ?? API_PREFIX).replace(
  /\/$/,
  "",
);

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly data?: unknown,
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

export function vineyardLogoUrl(vineyardId: string, version?: string): string {
  const query = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${apiBase}/vineyards/${vineyardId}/logo${query}`;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
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
  let data: unknown = undefined;
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
      data?: unknown;
    };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
    data = body.data;
  } catch {
    // keep status text
  }
  if (
    response.status === 401 &&
    code !== "INVALID_CREDENTIALS" &&
    path !== "/auth/login" &&
    path !== "/auth/me" &&
    path !== "/auth/change-password"
  ) {
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }
  throw new ApiError(code, message, response.status, data);
}

export function getApiHealth(signal?: AbortSignal): Promise<ApiHealth> {
  return apiJson<ApiHealth>("/health", { signal });
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

export async function getCurrentUser(signal?: AbortSignal): Promise<PublicUser> {
  const body = await apiJson<{ data: PublicUser }>("/auth/me", { signal });
  return body.data;
}

export type UpdateMePayload = {
  displayName?: string;
  email?: string;
  currentPassword?: string;
};

export async function updateCurrentUser(
  payload: UpdateMePayload,
): Promise<PublicUser> {
  const body = await apiJson<{ data: PublicUser }>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await apiJson<{ data: { ok: true } }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type ForgotPasswordResult = {
  ok: true;
  devResetUrl?: string;
};

export async function forgotPassword(email: string): Promise<ForgotPasswordResult> {
  const body = await apiJson<{ data: ForgotPasswordResult }>(
    "/auth/forgot-password",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
  return body.data;
}

export async function resetPassword(payload: {
  token: string;
  newPassword: string;
}): Promise<void> {
  await apiJson<{ data: { ok: true } }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listVineyardUsers(
  vineyardId: string,
  signal?: AbortSignal,
): Promise<PublicUser[]> {
  const body = await apiJson<ListResponse<PublicUser>>(
    `/vineyards/${vineyardId}/users`,
    { signal },
  );
  return body.data;
}

export type InviteUserPayload = {
  email: string;
  displayName: string;
  role: PublicUser["role"];
};

export type InviteUserResult = {
  user: PublicUser;
  temporaryPassword: string;
};

export async function inviteVineyardUser(
  vineyardId: string,
  payload: InviteUserPayload,
): Promise<InviteUserResult> {
  const body = await apiJson<{ data: InviteUserResult }>(
    `/vineyards/${vineyardId}/users`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return body.data;
}

export type UpdateVineyardUserPayload = {
  role?: PublicUser["role"];
  disabled?: boolean;
  displayName?: string;
};

export async function updateVineyardUser(
  vineyardId: string,
  userId: string,
  payload: UpdateVineyardUserPayload,
): Promise<PublicUser> {
  const body = await apiJson<{ data: PublicUser }>(
    `/vineyards/${vineyardId}/users/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
  return body.data;
}

export async function removeVineyardUser(
  vineyardId: string,
  userId: string,
): Promise<void> {
  await apiJson<{ data: { ok: true } }>(
    `/vineyards/${vineyardId}/users/${userId}`,
    { method: "DELETE" },
  );
}

export async function listVineyards(signal?: AbortSignal): Promise<Vineyard[]> {
  const body = await apiJson<ListResponse<Vineyard>>("/vineyards", { signal });
  return body.data;
}

export type VineyardWritePayload = {
  name: string;
  address: string;
  timezone: string;
  rowLayout?: RowLayout | null;
  healthThresholds?: HealthThresholds;
  varietyCatalog?: string[];
  varietyHarvestTags?: VarietyHarvestTags;
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
  const form = new FormData();
  form.append("file", file);
  const path = `/vineyards/${vineyardId}/logo`;
  const response = await fetch(`${apiBase}${path}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "fetch",
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

export async function getVineyardHealth(
  vineyardId: string,
  signal?: AbortSignal,
): Promise<VineyardHealth> {
  const body = await apiJson<{ data: VineyardHealth }>(
    `/vineyards/${vineyardId}/health`,
    { signal },
  );
  return body.data;
}

export async function getVineyardWeather(
  vineyardId: string,
  signal?: AbortSignal,
): Promise<VineyardWeather> {
  const body = await apiJson<{ data: VineyardWeather }>(
    `/vineyards/${vineyardId}/weather`,
    { signal },
  );
  return body.data;
}

export async function getVineyardMetrics(
  vineyardId: string,
  period: MetricsPeriod,
  signal?: AbortSignal,
): Promise<VineyardMetrics> {
  const params = new URLSearchParams({ period });
  const body = await apiJson<{ data: VineyardMetrics }>(
    `/vineyards/${vineyardId}/metrics?${params.toString()}`,
    { signal },
  );
  return body.data;
}

export async function listRows(
  vineyardId: string,
  signal?: AbortSignal,
  options?: { deleted?: "only" },
): Promise<Row[]> {
  const params = new URLSearchParams();
  if (options?.deleted) params.set("deleted", options.deleted);
  const query = params.toString();
  const body = await apiJson<ListResponse<Row>>(
    `/vineyards/${vineyardId}/rows${query ? `?${query}` : ""}`,
    { signal },
  );
  return body.data;
}

export async function restoreRow(
  vineyardId: string,
  rowId: string,
  code?: string,
): Promise<Row> {
  const body = await apiJson<{ data: Row }>(
    `/vineyards/${vineyardId}/rows/${rowId}/restore`,
    {
      method: "POST",
      body: JSON.stringify(code ? { code } : {}),
    },
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
  payload: Partial<RowWritePayload>,
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

/*
 * ---------------------------------------------------------------------------
 * Row delete + delete-preview. Types come from @vineyard/shared (Devon's
 * contract, Oct 7 2026); the aliases below keep Sage's dialog names working.
 * ---------------------------------------------------------------------------
 */

export type { RowDeletePreview };
/** "soft": row has history → kept as "Removed row". "hard": permanently deleted. */
export type RowDeleteMode = RowDeletePreview["mode"];
/** What DELETE does with the row's open tasks (API default: "keep"). */
export type RowDeleteOpenTasksOption = RowDeleteOpenTasksAction;
export type RowDeletePreviewOpenTask = RowDeleteOpenTask;
export type DeleteRowResult = RowDeleteResult;

/** GET /vineyards/:vid/rows/:rowId/delete-preview (manager+). Same mode/counts/message DELETE produces. */
export async function deleteRowPreview(
  vineyardId: string,
  rowId: string,
): Promise<RowDeletePreview> {
  const body = await apiJson<{ data: RowDeletePreview }>(
    `/vineyards/${vineyardId}/rows/${rowId}/delete-preview`,
  );
  return body.data;
}

/**
 * DELETE /vineyards/:vid/rows/:rowId (manager+). Soft-deletes rows with
 * history, hard-deletes empty rows (API decides). openTasks omitted → API
 * default "keep".
 */
export async function deleteRow(
  vineyardId: string,
  rowId: string,
  options?: { openTasks?: RowDeleteOpenTasksOption },
): Promise<DeleteRowResult> {
  const query = options?.openTasks
    ? `?openTasks=${encodeURIComponent(options.openTasks)}`
    : "";
  const body = await apiJson<{ data: DeleteRowResult }>(
    `/vineyards/${vineyardId}/rows/${rowId}${query}`,
    { method: "DELETE" },
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

export async function listTasks(
  vineyardId: string,
  signal?: AbortSignal,
  options?: { deleted?: "only"; seasonId?: string },
): Promise<ScheduledTask[]> {
  const params = new URLSearchParams();
  if (options?.deleted) params.set("deleted", options.deleted);
  if (options?.seasonId) params.set("seasonId", options.seasonId);
  const query = params.toString();
  const body = await apiJson<ListResponse<ScheduledTask>>(
    `/vineyards/${vineyardId}/tasks${query ? `?${query}` : ""}`,
    { signal },
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

export async function deleteTask(
  vineyardId: string,
  taskId: string,
): Promise<void> {
  await apiJson<{ data: ScheduledTask }>(
    `/vineyards/${vineyardId}/tasks/${taskId}`,
    { method: "DELETE" },
  );
}

export async function restoreTask(
  vineyardId: string,
  taskId: string,
): Promise<ScheduledTask> {
  const body = await apiJson<{ data: ScheduledTask }>(
    `/vineyards/${vineyardId}/tasks/${taskId}/restore`,
    { method: "POST" },
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

export async function listHarvests(
  rowId?: string,
  signal?: AbortSignal,
  options?: { deleted?: "only"; seasonId?: string; vineyardId?: string },
): Promise<Harvest[]> {
  const params = new URLSearchParams();
  if (rowId) params.set("rowId", rowId);
  if (options?.deleted) params.set("deleted", options.deleted);
  if (options?.seasonId) params.set("seasonId", options.seasonId);
  if (options?.vineyardId) params.set("vineyardId", options.vineyardId);
  const query = params.toString();
  const body = await apiJson<ListResponse<Harvest>>(
    `/harvests${query ? `?${query}` : ""}`,
    { signal },
  );
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

export async function restoreHarvest(harvestId: string): Promise<Harvest> {
  const body = await apiJson<{ data: Harvest }>(
    `/harvests/${harvestId}/restore`,
    { method: "POST" },
  );
  return body.data;
}

export type ActivityWritePayload = {
  scopeType: ActivityScope;
  scopeId: string;
  activityType: ActivityType;
  performedAt?: string;
  details?: Record<string, unknown>;
  source?: ActivitySource;
};

export type ActivityUpdatePayload = {
  scopeType?: "vineyard" | "row";
  scopeId?: string;
  activityType?: ActivityType;
  performedAt?: string;
  details?: Record<string, unknown>;
};

export async function listActivities(
  vineyardId: string,
  filters?: {
    rowId?: string;
    activityType?: ActivityType;
    scopeType?: ActivityScope;
    deleted?: "only";
    seasonId?: string;
  },
  signal?: AbortSignal,
): Promise<Activity[]> {
  const params = new URLSearchParams();
  if (filters?.rowId) params.set("rowId", filters.rowId);
  if (filters?.activityType) params.set("activityType", filters.activityType);
  if (filters?.scopeType) params.set("scopeType", filters.scopeType);
  if (filters?.deleted) params.set("deleted", filters.deleted);
  if (filters?.seasonId) params.set("seasonId", filters.seasonId);
  const query = params.toString();
  const body = await apiJson<ListResponse<Activity>>(
    `/vineyards/${vineyardId}/activities${query ? `?${query}` : ""}`,
    { signal },
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

export async function updateActivity(
  id: string,
  payload: ActivityUpdatePayload,
): Promise<Activity> {
  const body = await apiJson<{ data: Activity }>(`/activities/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function deleteActivity(id: string): Promise<void> {
  await apiJson<{ data: Activity }>(`/activities/${id}`, {
    method: "DELETE",
  });
}

export async function restoreActivity(id: string): Promise<Activity> {
  const body = await apiJson<{ data: Activity }>(`/activities/${id}/restore`, {
    method: "POST",
  });
  return body.data;
}

export type NotificationPrefsResponse = {
  emailEnabled: boolean;
  weeklyDigest: boolean;
  pushEnabled: boolean;
  frequency: "weekly" | "as_needed" | "daily";
  [key: string]: unknown;
};

export async function getNotificationPrefs(
  signal?: AbortSignal,
): Promise<NotificationPrefsResponse> {
  const body = await apiJson<{ data: NotificationPrefsResponse }>(
    "/auth/me/notification-prefs",
    { signal },
  );
  return body.data;
}

export async function updateNotificationPrefs(
  patch: Partial<Pick<NotificationPrefsResponse, "emailEnabled" | "weeklyDigest" | "pushEnabled" | "frequency">>,
): Promise<NotificationPrefsResponse> {
  const body = await apiJson<{ data: NotificationPrefsResponse }>(
    "/auth/me/notification-prefs",
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return body.data;
}

export async function listSeasons(
  vineyardId: string,
  signal?: AbortSignal,
): Promise<SeasonDto[]> {
  const body = await apiJson<ListResponse<SeasonDto>>(
    `/vineyards/${vineyardId}/seasons`,
    { signal },
  );
  return body.data;
}

export async function getCurrentSeason(
  vineyardId: string,
  signal?: AbortSignal,
): Promise<CurrentSeasonState> {
  const body = await apiJson<{ data: CurrentSeasonState }>(
    `/vineyards/${vineyardId}/seasons/current`,
    { signal },
  );
  return body.data;
}

export async function getSeasonDetail(
  vineyardId: string,
  seasonId: string,
  signal?: AbortSignal,
): Promise<SeasonDto> {
  const body = await apiJson<{ data: SeasonDto }>(
    `/vineyards/${vineyardId}/seasons/${seasonId}`,
    { signal },
  );
  return body.data;
}

export async function getCloseSeasonPreview(
  vineyardId: string,
  seasonId: string,
  signal?: AbortSignal,
): Promise<CloseSeasonPreview> {
  const body = await apiJson<{ data: CloseSeasonPreview }>(
    `/vineyards/${vineyardId}/seasons/${seasonId}/close-preview`,
    { signal },
  );
  return body.data;
}

export async function closeSeason(
  vineyardId: string,
  seasonId: string,
  previewToken: string,
): Promise<CloseSeasonResult> {
  const body = await apiJson<{ data: CloseSeasonResult }>(
    `/vineyards/${vineyardId}/seasons/${seasonId}/close`,
    {
      method: "POST",
      body: JSON.stringify({ previewToken }),
    },
  );
  return body.data;
}

export async function reopenSeason(
  vineyardId: string,
  seasonId: string,
): Promise<ReopenSeasonResult> {
  const body = await apiJson<{ data: ReopenSeasonResult }>(
    `/vineyards/${vineyardId}/seasons/${seasonId}/reopen`,
    { method: "POST" },
  );
  return body.data;
}

export async function getNewSeasonPreview(
  vineyardId: string,
  signal?: AbortSignal,
): Promise<NewSeasonPreview> {
  const body = await apiJson<{ data: NewSeasonPreview }>(
    `/vineyards/${vineyardId}/seasons/new-preview`,
    { signal },
  );
  return body.data;
}

export type CreateNewSeasonPayload = {
  year: number;
  tasks: Array<{
    templateKey: string;
    dueDate: string;
    checked: boolean;
    title?: string;
    body?: string;
    relatedActivityType?: ActivityType | null;
  }>;
  varietyHarvestTags?: VarietyHarvestTags;
};

export async function createNewSeason(
  vineyardId: string,
  payload: CreateNewSeasonPayload,
): Promise<NewSeasonResult> {
  const body = await apiJson<{ data: NewSeasonResult }>(
    `/vineyards/${vineyardId}/seasons/new`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return body.data;
}


