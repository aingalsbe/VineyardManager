import { z } from "zod";
import {
  ACTIVITY_SCOPES,
  ACTIVITY_SOURCES,
  ACTIVITY_TYPES,
  ROW_STATUSES,
  HARVEST_CONDITIONS,
  HEALTH_COLORS,
  TASK_STATUSES,
  TASK_TYPES,
  USER_ROLES,
  VINE_STATUSES,
  WATERING_METHODS,
  YIELD_UNITS,
  METRICS_PERIODS,
  ROW_DELETE_OPEN_TASK_ACTIONS,
  WEATHER_ALERT_SEVERITIES,
  WEATHER_ALERT_SOURCES,
  WEATHER_HAZARDS,
} from "./constants.js";

export const MAX_PASSWORD_LENGTH = 72;

export function isValidIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const listPaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});

export const userRoleSchema = z.enum(USER_ROLES);

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(254)
    .toLowerCase(),
  password: z
    .string()
    .min(1, "Enter a password")
    .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
});

export const updateMeSchema = z
  .object({
    displayName: z.string().trim().min(1, "Enter a name").max(80).optional(),
    email: z
      .string()
      .trim()
      .email("Enter a valid email")
      .max(254)
      .toLowerCase()
      .optional(),
    currentPassword: z
      .string()
      .min(1, "Enter your current password")
      .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`)
      .optional(),
  })
  .refine(
    (value) => value.displayName !== undefined || value.email !== undefined,
    { message: "Enter at least one field" },
  );

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Enter your current password")
    .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
  newPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(254)
    .toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required").max(256),
  newPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
});

export const inviteUserSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(254)
    .toLowerCase(),
  displayName: z.string().trim().min(1, "Enter a name").max(120),
  role: userRoleSchema,
});

export const updateVineyardUserSchema = z
  .object({
    role: userRoleSchema.optional(),
    disabled: z.boolean().optional(),
    displayName: z.string().trim().min(1, "Enter a name").max(120).optional(),
  })
  .refine(
    (value) =>
      value.role !== undefined ||
      value.disabled !== undefined ||
      value.displayName !== undefined,
    { message: "Enter at least one field" },
  );

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(254)
    .toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
  displayName: z.string().trim().min(1, "Enter a name").max(120),
});

export const vineStatusSchema = z.enum(VINE_STATUSES);
export const rowStatusSchema = z.enum(ROW_STATUSES);
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export const activityScopeSchema = z.enum(ACTIVITY_SCOPES);
export const activitySourceSchema = z.enum(ACTIVITY_SOURCES);
export const healthColorSchema = z.enum(HEALTH_COLORS);
export const taskTypeSchema = z.enum(TASK_TYPES);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const yieldUnitSchema = z.enum(YIELD_UNITS);
export const metricsPeriodSchema = z.enum(METRICS_PERIODS);

export const healthThresholdsSchema = z
  .object({
    greenMin: z.number().min(0).max(100),
    yellowMin: z.number().min(0).max(100),
    orangeMin: z.number().min(0).max(100),
  })
  .refine(
    (value) =>
      value.greenMin > value.yellowMin && value.yellowMin > value.orangeMin,
    { message: "Green cutoff must be above yellow, and yellow above orange" },
  );

export const varietyCatalogSchema = z
  .array(z.string().trim().min(1, "Enter a variety").max(80))
  .max(200, "At most 200 varieties");

const vineyardVarietyHarvestTagsSchema = z.record(
  z.string().trim().min(1).max(80),
  z.enum(["early", "mid", "late"]),
);

export const rowLayoutSchema = z.object({
  version: z.literal(1),
  rows: z
    .array(
      z.object({
        rowId: z.string().uuid(),
        x: z.number().finite(),
        y: z.number().finite(),
        rotationDeg: z.number().finite(),
      }),
    )
    .max(500, "At most 500 rows in layout"),
});

const ianaTimeZoneSchema = z
  .string()
  .trim()
  .min(1, "Enter a timezone")
  .max(80)
  .refine(isValidIanaTimeZone, { message: "Enter a valid IANA timezone" });

export const createVineyardSchema = z.object({
  name: z.string().trim().min(1, "Enter a vineyard name").max(120),
  address: z.string().trim().min(1, "Enter an address").max(300),
  timezone: ianaTimeZoneSchema.default("America/Chicago"),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const updateVineyardSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a vineyard name").max(120).optional(),
    address: z.string().trim().min(1, "Enter an address").max(300).optional(),
    timezone: ianaTimeZoneSchema.optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    rowLayout: rowLayoutSchema.nullable().optional(),
    healthThresholds: healthThresholdsSchema.optional(),
    varietyCatalog: varietyCatalogSchema.optional(),
    varietyHarvestTags: vineyardVarietyHarvestTagsSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.address !== undefined ||
      value.timezone !== undefined ||
      value.lat !== undefined ||
      value.lng !== undefined ||
      value.rowLayout !== undefined ||
      value.healthThresholds !== undefined ||
      value.varietyCatalog !== undefined ||
      value.varietyHarvestTags !== undefined,
    { message: "Enter at least one field" },
  );

export const createRowSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a row code")
    .max(32)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, "Enter a name").max(120),
  variety: z.string().trim().min(1, "Enter a variety").max(80),
  lengthFeet: z.coerce
    .number()
    .int()
    .nonnegative("Feet cannot be negative")
    .max(100_000, "Feet value is too large"),
  lengthInches: z.coerce
    .number()
    .int()
    .min(0, "Inches must be 0–11")
    .max(11, "Inches must be 0–11"),
  vineCount: z.coerce
    .number()
    .int()
    .nonnegative("Vine count cannot be negative")
    .max(100_000, "Vine count is too large"),
  plantedYear: z.coerce
    .number()
    .int()
    .min(1900, "Enter a planting year")
    .max(2100, "Enter a planting year"),
  status: rowStatusSchema.default("active"),
  notes: z
    .string()
    .max(2000)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
});

/** PATCH: any subset of row fields; only sent fields are validated/applied. */
export const updateRowSchema = createRowSchema
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined) , {
    message: "Enter at least one field",
  });

export const rowDeleteOpenTasksSchema = z.enum(ROW_DELETE_OPEN_TASK_ACTIONS, {
  errorMap: () => ({ message: 'openTasks must be "keep" or "dismiss"' }),
});

/** DELETE /rows/:id options (query and/or JSON body). openTasks defaults to "keep". */
export const deleteRowOptionsSchema = z.object({
  openTasks: rowDeleteOpenTasksSchema.optional(),
});

export const createTaskSchema = z.object({
  rowId: z
    .union([z.string().uuid(), z.literal("")])
    .optional()
    .transform((value) => (value ? value : null)),
  type: taskTypeSchema.default("maintenance"),
  title: z.string().trim().min(1, "Enter a title").max(200),
  body: z
    .string()
    .max(4000)
    .optional()
    .transform((value) => value?.trim() ?? ""),
  dueAt: z.string().min(1, "Enter a due date"),
  status: taskStatusSchema.default("pending"),
  relatedActivityType: z
    .union([activityTypeSchema, z.literal("")])
    .optional()
    .transform((value) => (value ? value : null)),
});

export const updateTaskSchema = createTaskSchema.partial();

const MAX_ACTIVITY_DETAILS_BYTES = 8192;

const activityDetailsSchema = z
  .record(z.unknown())
  .refine(
    (value) => {
      try {
        return JSON.stringify(value).length <= MAX_ACTIVITY_DETAILS_BYTES;
      } catch {
        return false;
      }
    },
    { message: "Activity details are too large" },
  );

export const createActivitySchema = z.object({
  scopeType: activityScopeSchema,
  scopeId: z.string().uuid(),
  activityType: activityTypeSchema,
  performedAt: z.string().optional(),
  details: activityDetailsSchema.default({}),
  source: activitySourceSchema.default("manual"),
});

/**
 * Editable work-log fields (F1, D-06). `source` and `performedBy` are not editable.
 */
export const updateActivitySchema = z
  .object({
    scopeType: z.enum(["vineyard", "row"]).optional(),
    scopeId: z.string().uuid().optional(),
    activityType: activityTypeSchema.optional(),
    performedAt: z.string().min(1, "Enter a valid date").optional(),
    details: activityDetailsSchema.optional(),
  })
  .refine(
    (value) =>
      value.scopeType !== undefined ||
      value.scopeId !== undefined ||
      value.activityType !== undefined ||
      value.performedAt !== undefined ||
      value.details !== undefined,
    { message: "Enter at least one field" },
  );

export const restoreRowSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a row code")
    .max(32)
    .transform((value) => value.toUpperCase())
    .optional(),
});

export const wateringDetailsSchema = z.object({
  durationMin: z.number().positive().optional(),
  method: z.enum(WATERING_METHODS),
  volumeGal: z.number().nonnegative().optional(),
  rainInches: z.number().nonnegative().optional(),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  provider: z.string().optional(),
  checkDate: z.string().optional(),
  notes: z.string().optional(),
});

export const createHarvestSchema = z.object({
  rowId: z.string().uuid("Select a row"),
  harvestedAt: z.string().min(1, "Enter a harvest date"),
  yieldAmount: z.coerce
    .number()
    .positive("Enter a yield amount")
    .max(999_999.99, "Yield amount is too large"),
  yieldUnit: yieldUnitSchema,
  notes: z
    .string()
    .max(2000)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  crew: z
    .string()
    .max(200)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
});

export const updateHarvestSchema = createHarvestSchema.partial();

export const harvestDetailsSchema = z.object({
  weightLb: z.number().nonnegative(),
  condition: z.enum(HARVEST_CONDITIONS),
});


export const weatherHazardSchema = z.enum(WEATHER_HAZARDS);
export const weatherAlertSeveritySchema = z.enum(WEATHER_ALERT_SEVERITIES);
export const weatherAlertSourceSchema = z.enum(WEATHER_ALERT_SOURCES);

export const weatherCurrentSchema = z.object({
  observedAt: z.string(),
  tempF: z.number(),
  feelsLikeF: z.number().nullable(),
  humidityPct: z.number().nullable(),
  precipInches: z.number().nullable(),
  windMph: z.number().nullable(),
  windGustMph: z.number().nullable(),
  weatherCode: z.number().int(),
  summary: z.string(),
});

export const weatherDailySchema = z.object({
  date: z.string(),
  tempMaxF: z.number(),
  tempMinF: z.number(),
  precipInches: z.number(),
  precipProbabilityPct: z.number().nullable(),
  windMphMax: z.number().nullable(),
  weatherCode: z.number().int(),
  summary: z.string(),
});

export const weatherAlertSchema = z.object({
  id: z.string(),
  hazard: weatherHazardSchema,
  severity: weatherAlertSeveritySchema,
  title: z.string(),
  description: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  source: weatherAlertSourceSchema,
});

export const vineyardWeatherSchema = z.object({
  vineyardId: z.string().uuid(),
  timeZone: z.string(),
  lat: z.number(),
  lng: z.number(),
  geocoded: z.boolean(),
  provider: z.literal("open-meteo"),
  fetchedAt: z.string(),
  cached: z.boolean(),
  cacheExpiresAt: z.string(),
  current: weatherCurrentSchema,
  daily: z.array(weatherDailySchema),
  alerts: z.array(weatherAlertSchema),
});

export const weatherHistoryDaySchema = z.object({
  date: z.string(),
  precipInches: z.number(),
  tempMaxF: z.number().nullable(),
  tempMinF: z.number().nullable(),
  windMphMax: z.number().nullable(),
});

export const vineyardWeatherHistorySchema = z.object({
  vineyardId: z.string().uuid(),
  timeZone: z.string(),
  provider: z.literal("open-meteo"),
  fetchedAt: z.string(),
  cached: z.boolean(),
  cacheExpiresAt: z.string(),
  days: z.array(weatherHistoryDaySchema),
});

export const weatherHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional().default(14),
});

/**
 * User.notificationPrefs (JSON). Lenient: missing keys get defaults, so older
 * rows without weeklyDigest are opted in.
 */
export const notificationPrefsSchema = z
  .object({
    emailEnabled: z.boolean().default(true),
    pushEnabled: z.boolean().default(true),
    frequency: z.enum(["weekly", "as_needed", "daily"]).default("weekly"),
    weeklyDigest: z.boolean().default(true),
  })
  .passthrough();

/** True unless emailEnabled === false or weeklyDigest === false. */
export function wantsWeeklyDigest(prefs: unknown): boolean {
  const parsed = notificationPrefsSchema.safeParse(
    prefs && typeof prefs === "object" ? prefs : {},
  );
  if (!parsed.success) {
    // Malformed prefs: honor explicit false flags if present, else opted in.
    const raw = (prefs ?? {}) as Record<string, unknown>;
    return raw.emailEnabled !== false && raw.weeklyDigest !== false;
  }
  return parsed.data.emailEnabled && parsed.data.weeklyDigest;
}

export const updateNotificationPrefsSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    frequency: z.enum(["weekly", "as_needed", "daily"]).optional(),
  })
  .refine(
    (value) =>
      value.emailEnabled !== undefined ||
      value.weeklyDigest !== undefined ||
      value.pushEnabled !== undefined ||
      value.frequency !== undefined,
    { message: "Enter at least one notification preference" },
  );

export type NotificationPrefsPatch = z.infer<typeof updateNotificationPrefsSchema>;

/**
 * Merge a validated notification-prefs patch into existing JSON while preserving
 * all unknown keys and applying defaults for missing standard keys (F5).
 */
export function mergeNotificationPrefs(
  existing: unknown,
  patch: NotificationPrefsPatch,
): Record<string, unknown> & {
  emailEnabled: boolean;
  weeklyDigest: boolean;
  pushEnabled: boolean;
  frequency: "weekly" | "as_needed" | "daily";
} {
  const baseObj =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const normalized = notificationPrefsSchema.safeParse(baseObj);
  const defaults = normalized.success
    ? normalized.data
    : {
        emailEnabled: baseObj.emailEnabled !== false,
        weeklyDigest: baseObj.weeklyDigest !== false,
        pushEnabled: baseObj.pushEnabled !== false,
        frequency: "weekly" as const,
      };
  return {
    ...baseObj,
    ...defaults,
    ...(patch.emailEnabled !== undefined ? { emailEnabled: patch.emailEnabled } : {}),
    ...(patch.weeklyDigest !== undefined ? { weeklyDigest: patch.weeklyDigest } : {}),
    ...(patch.pushEnabled !== undefined ? { pushEnabled: patch.pushEnabled } : {}),
    ...(patch.frequency !== undefined ? { frequency: patch.frequency } : {}),
  };
}

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
