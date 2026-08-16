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
} from "./constants.js";

export const userRoleSchema = z.enum(USER_ROLES);
export const vineStatusSchema = z.enum(VINE_STATUSES);
export const rowStatusSchema = z.enum(ROW_STATUSES);
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

export const createRowSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  variety: z.string().min(1).max(80),
  lengthFeet: z.number().int().nonnegative(),
  lengthInches: z.number().int().min(0).max(11),
  vineCount: z.number().int().nonnegative(),
  plantedYear: z.number().int().min(1900).max(2100),
  status: rowStatusSchema.default("active"),
  notes: z.string().max(2000).optional(),
});

export const createTaskSchema = z.object({
  rowId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  type: taskTypeSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  dueAt: z.string().datetime(),
  relatedActivityType: activityTypeSchema.optional(),
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
