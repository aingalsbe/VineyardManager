import { z } from "zod";
import { SEASON_STATUSES, VARIETY_HARVEST_TIMINGS } from "./constants.js";
import { activityTypeSchema } from "./schemas.js";
import type { ActivityType, HealthColor, HealthReason } from "./types.js";

export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export const SEASON_STATUS_LABELS: Record<SeasonStatus, string> = {
  legacy: "Legacy",
  active: "Active",
  planned: "Planned",
  closed: "Closed",
};

export const SEASON_SUMMARY_MAIL_STATUSES = [
  "pending",
  "sent",
  "failed",
  "skipped",
] as const;
export type SeasonSummaryMailStatus = (typeof SEASON_SUMMARY_MAIL_STATUSES)[number];

export type VarietyHarvestTiming = (typeof VARIETY_HARVEST_TIMINGS)[number];

export const VARIETY_HARVEST_TIMING_LABELS: Record<VarietyHarvestTiming, string> = {
  early: "Early",
  mid: "Mid",
  late: "Late",
};

export type VarietyHarvestTags = Record<string, VarietyHarvestTiming>;

export const CALENDAR_STAGES = [
  "dormant",
  "bud_break",
  "bloom",
  "bloom_to_veraison",
  "veraison",
  "harvest",
  "post_harvest",
] as const;
export type CalendarStage = (typeof CALENDAR_STAGES)[number];

export const CALENDAR_STAGE_LABELS: Record<CalendarStage, string> = {
  dormant: "Dormant",
  bud_break: "Bud break & spring",
  bloom: "Pre-bloom & canopy",
  bloom_to_veraison: "Bloom to veraison",
  veraison: "Midsummer & veraison",
  harvest: "Harvest",
  post_harvest: "Post-harvest & winterize",
};

export const SEASON_REOPEN_WINDOW_DAYS = 30;
export const SEASON_REOPEN_WINDOW_MS =
  SEASON_REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export const SEASON_ERROR_CODES = {
  SEASON_LOCKED: "SEASON_LOCKED",
  SEASON_NOT_ACTIVE: "SEASON_NOT_ACTIVE",
  PREVIEW_STALE: "PREVIEW_STALE",
  NOT_DORMANT: "NOT_DORMANT",
  VINEYARD_DORMANT: "VINEYARD_DORMANT",
  REOPEN_WINDOW_PASSED: "REOPEN_WINDOW_PASSED",
  ROW_CODE_TAKEN: "ROW_CODE_TAKEN",
} as const;

export const SEASON_LOCKED_MESSAGE =
  "This season is closed. A power user can reopen it within 30 days.";

export function computeReopenableUntil(
  closedAt: Date | string | null | undefined,
): string | null {
  if (!closedAt) return null;
  const date = closedAt instanceof Date ? closedAt : new Date(closedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + SEASON_REOPEN_WINDOW_MS).toISOString();
}

export interface SeasonHealthMonthlyPoint {
  month: string;
  score: number;
  color: HealthColor;
}

export interface SeasonDismissedTaskItem {
  id: string;
  title: string;
  dueDate: string;
  rowCode: string | null;
}

export interface SeasonHarvestByVarietySnapshot {
  variety: string;
  totalLb: number;
}

export interface SeasonHarvestByRowSnapshot {
  rowId: string;
  code: string;
  name: string;
  variety: string;
  totalLb: number;
}

export interface SeasonPestObservationFlag {
  activityId: string;
  performedDate: string;
  rowId: string | null;
  rowCode: string | null;
  notes: string | null;
}

export interface SeasonSnapshot {
  schemaVersion: 1;
  vineyardId: string;
  vineyardName: string;
  timeZone: string;
  seasonId: string;
  year: number;
  startedAt: string | null;
  closedAt: string;
  asOfDate: string;
  health: {
    score: number;
    color: HealthColor;
    reasons: HealthReason[];
    monthlyTrend?: SeasonHealthMonthlyPoint[];
  };
  activeRows: Array<{
    rowId: string;
    code: string;
    name: string;
    variety: string;
  }>;
  harvests: {
    unit: "lb";
    totalLb: number;
    skippedNonLb: number;
    byVariety: SeasonHarvestByVarietySnapshot[];
    byRow: SeasonHarvestByRowSnapshot[];
    previousSeasonYear: number | null;
    previousTotalLb: number | null;
    previousByVariety: SeasonHarvestByVarietySnapshot[];
    previousByRow: Array<{ rowId: string; code: string; totalLb: number }>;
  };
  activities: {
    waterings: number;
    fertilizing: number;
    pestTreatments: number;
    weedTreatments: number;
    pestObservationsWithoutTreatment14d: SeasonPestObservationFlag[];
  };
  tasks: {
    total: number;
    doneOnTime: number;
    doneLate: number;
    dismissedBeforeClose: number;
    dismissedByClose: number;
    dismissedByCloseList: SeasonDismissedTaskItem[];
  };
  weather: {
    available: boolean;
    unavailableReason?: string | null;
    frostDays: number;
    heavyRainDays: number;
    drySpells: number;
    dateStart: string | null;
    dateEnd: string | null;
  };
}

export interface SeasonSummaryPoint {
  code: string;
  text: string;
}

export interface SeasonSummary {
  schemaVersion: 1;
  seasonId: string;
  year: number;
  vineyardName: string;
  closedAt: string;
  closeVersion: number;
  health: {
    score: number;
    color: HealthColor;
    reasons: HealthReason[];
    monthlyTrend?: SeasonHealthMonthlyPoint[];
  };
  harvests: {
    unit: "lb";
    totalLb: number;
    skippedNonLb: number;
    previousSeasonYear: number | null;
    previousTotalLb: number | null;
    deltaPct: number | null;
    byVariety: Array<{
      variety: string;
      totalLb: number;
      previousTotalLb: number | null;
      deltaPct: number | null;
    }>;
    byRow: Array<{
      rowId: string;
      code: string;
      name: string;
      variety: string;
      totalLb: number;
      previousTotalLb: number | null;
    }>;
  };
  work: {
    waterings: number;
    fertilizing: number;
    pestTreatments: number;
    weedTreatments: number;
  };
  tasks: {
    total: number;
    doneOnTime: number;
    doneLate: number;
    onTimePct: number | null;
    dismissedBeforeClose: number;
    dismissedByClose: number;
    dismissedByCloseList: SeasonDismissedTaskItem[];
  };
  weather: {
    available: boolean;
    note: string;
    frostDays: number;
    heavyRainDays: number;
    drySpells: number;
  };
  positives: SeasonSummaryPoint[];
  negatives: SeasonSummaryPoint[];
}

export interface SeasonDto {
  id: string;
  vineyardId: string;
  year: number;
  status: SeasonStatus;
  startedAt: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  startedBy: string | null;
  closedBy: string | null;
  closeVersion: number;
  reopenableUntil: string | null;
  hasSummary: boolean;
  summary?: SeasonSummary | null;
  summaryHistory?: SeasonSummary[];
  createdAt: string;
  updatedAt: string;
}

export type CurrentSeasonState =
  | {
      dormant: false;
      dormantSince: null;
      season: SeasonDto | null;
      lastClosedSeason: SeasonDto | null;
      plannedSeason: SeasonDto | null;
    }
  | {
      dormant: true;
      dormantSince: string | null;
      season: null;
      lastClosedSeason: SeasonDto;
      plannedSeason: SeasonDto | null;
    };

export interface CloseSeasonPreviewTask {
  id: string;
  title: string;
  dueDate: string;
  status: "pending" | "sent";
  rowCode: string | null;
}

export interface CloseSeasonPreview {
  seasonId: string;
  year: number;
  openTaskCount: number;
  openTasks: CloseSeasonPreviewTask[];
  untaggedOpenTaskCount: number;
  harvests: {
    unit: "lb";
    totalLb: number;
    skippedNonLb: number;
    byVariety: SeasonHarvestByVarietySnapshot[];
    byRow: SeasonHarvestByRowSnapshot[];
  };
  work: {
    waterings: number;
    fertilizing: number;
    pestTreatments: number;
    weedTreatments: number;
  };
  health: {
    score: number;
    color: HealthColor;
    reasons: HealthReason[];
  };
  midSeason: boolean;
  midSeasonReason: string | null;
  previewToken: string;
}

export interface CloseSeasonResult {
  season: SeasonDto;
  dismissedTaskCount: number;
  alreadyClosed?: boolean;
}

export interface ReopenSeasonResult {
  season: SeasonDto;
  alreadyActive?: boolean;
}

export interface NewSeasonSuggestedTask {
  templateKey: string;
  title: string;
  body: string;
  stage: CalendarStage;
  dueDate: string;
  checked: boolean;
  relatedActivityType: ActivityType | null;
  source: string;
  isEstimate: boolean;
  variety?: string | null;
}

export interface NewSeasonVarietySuggestion {
  name: string;
  currentTag: VarietyHarvestTiming | null;
  suggestedTag: VarietyHarvestTiming | null;
  suggestionSource: string | null;
}

export interface NewSeasonClimateSummary {
  yearsAnalyzed: number;
  avgLastSpringFrost: string | null;
  avgFirstFallFrost: string | null;
  estimatedBudBreak: string | null;
  estimatedBloom: string | null;
  estimatedVeraison: string | null;
}

export interface NewSeasonPreview {
  year: number;
  plannedSeasonId: string | null;
  calendarSource: "location" | "fixed_fallback";
  calendarNote: string;
  climateSummary: NewSeasonClimateSummary | null;
  varieties: NewSeasonVarietySuggestion[];
  tasks: NewSeasonSuggestedTask[];
}

export interface NewSeasonResult {
  season: SeasonDto;
  promotedFromPlanned: boolean;
  createdTaskCount: number;
}

export const seasonStatusSchema = z.enum(SEASON_STATUSES);
export const varietyHarvestTimingSchema = z.enum(VARIETY_HARVEST_TIMINGS);

export const varietyHarvestTagsSchema = z.record(
  z.string().trim().min(1).max(80),
  varietyHarvestTimingSchema,
);

export const closeSeasonSchema = z.object({
  previewToken: z.string().trim().min(1, "previewToken is required").max(128),
});

export const newSeasonTaskInputSchema = z.object({
  templateKey: z.string().trim().min(1).max(120),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for task dueDate"),
  checked: z.boolean(),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().max(4000).optional(),
  relatedActivityType: activityTypeSchema.nullable().optional(),
});

export const createNewSeasonSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  tasks: z.array(newSeasonTaskInputSchema).max(100),
  varietyHarvestTags: varietyHarvestTagsSchema.optional(),
});
