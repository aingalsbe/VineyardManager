import { z } from "zod";
import {
  ACTIVITY_SCOPES,
  ACTIVITY_SOURCES,
  ACTIVITY_TYPES,
  HARVEST_CONDITIONS,
  HEALTH_COLORS,
  TASK_STATUSES,
  TASK_TYPES,
  USER_ROLES,
  VINE_STATUSES,
  WATERING_METHODS,
} from "./constants.js";

export const userRoleSchema = z.enum(USER_ROLES);
export const vineStatusSchema = z.enum(VINE_STATUSES);
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export const activityScopeSchema = z.enum(ACTIVITY_SCOPES);
export const activitySourceSchema = z.enum(ACTIVITY_SOURCES);
export const healthColorSchema = z.enum(HEALTH_COLORS);
export const taskTypeSchema = z.enum(TASK_TYPES);
export const taskStatusSchema = z.enum(TASK_STATUSES);

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

export const createBlockSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  notes: z.string().max(2000).optional(),
});

export const createRowSchema = z.object({
  code: z.string().min(1).max(16),
  label: z.string().max(80).optional(),
  vineCount: z.number().int().positive(),
  spacingFt: z.number().positive(),
  orientation: z.string().max(16).optional(),
  varietyId: z.string().uuid().optional(),
  blockId: z.string().uuid().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const createActivitySchema = z.object({
  scopeType: activityScopeSchema,
  scopeId: z.string().uuid(),
  activityType: activityTypeSchema,
  performedAt: z.string().datetime().optional(),
  details: z.record(z.unknown()).default({}),
  source: activitySourceSchema.default("manual"),
});

export const wateringDetailsSchema = z.object({
  durationMin: z.number().positive(),
  method: z.enum(WATERING_METHODS),
  volumeGal: z.number().nonnegative().optional(),
});

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
