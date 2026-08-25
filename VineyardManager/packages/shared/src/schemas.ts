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
} from "./constants.js";

export const userRoleSchema = z.enum(USER_ROLES);

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .toLowerCase(),
  password: z.string().min(1, "Enter a password"),
});

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
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

export const healthThresholdsSchema = z.object({
  greenMin: z.number().min(0).max(100),
  yellowMin: z.number().min(0).max(100),
  orangeMin: z.number().min(0).max(100),
});

export const createVineyardSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().min(1).max(300),
  timezone: z.string().min(1).default("America/Chicago"),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const createRowSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a row code")
    .max(32)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, "Enter a name").max(120),
  variety: z.string().trim().min(1, "Enter a variety").max(80),
  lengthFeet: z.coerce.number().int().nonnegative("Feet cannot be negative"),
  lengthInches: z.coerce
    .number()
    .int()
    .min(0, "Inches must be 0–11")
    .max(11, "Inches must be 0–11"),
  vineCount: z.coerce.number().int().nonnegative("Vine count cannot be negative"),
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

export const updateRowSchema = createRowSchema;

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

export const createActivitySchema = z.object({
  scopeType: activityScopeSchema,
  scopeId: z.string().uuid(),
  activityType: activityTypeSchema,
  performedAt: z.string().optional(),
  details: z.record(z.unknown()).default({}),
  source: activitySourceSchema.default("manual"),
});

export const updateActivitySchema = createActivitySchema.partial();

export const wateringDetailsSchema = z.object({
  durationMin: z.number().positive(),
  method: z.enum(WATERING_METHODS),
  volumeGal: z.number().nonnegative().optional(),
});

export const createHarvestSchema = z.object({
  rowId: z.string().uuid("Select a row"),
  harvestedAt: z.string().min(1, "Enter a harvest date"),
  yieldAmount: z.coerce.number().positive("Enter a yield amount"),
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

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
