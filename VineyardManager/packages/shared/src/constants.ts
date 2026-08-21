export const USER_ROLES = ["power_user", "manager", "viewer"] as const;

export const VINE_STATUSES = ["active", "replaced", "removed"] as const;

export const ROW_STATUSES = [
  "active",
  "fallow",
  "replanting",
  "retired",
] as const;

export const ACTIVITY_TYPES = [
  "pruning",
  "watering",
  "fertilization",
  "pest_prevention",
  "weed_prevention",
  "harvest",
  "health_observation",
  "vine_replacement",
  "winterization",
  "other",
] as const;

export const ACTIVITY_SCOPES = [
  "vineyard",
  "block",
  "row",
  "variety",
  "vine",
] as const;

export const ACTIVITY_SOURCES = ["manual", "ai_suggested", "imported"] as const;

export const HEALTH_COLORS = ["green", "yellow", "orange", "red"] as const;

export const HEALTH_SCORE_DEFAULTS = {
  greenMin: 80,
  yellowMin: 70,
  orangeMin: 60,
} as const;

export const TASK_TYPES = ["maintenance", "weather", "health_summary"] as const;

export const TASK_STATUSES = [
  "pending",
  "sent",
  "acknowledged",
  "dismissed",
] as const;

export const TASK_STATUS_LABELS: Record<(typeof TASK_STATUSES)[number], string> =
  {
    pending: "Not started",
    sent: "In progress",
    acknowledged: "Complete",
    dismissed: "Dismissed",
  };

export const TASK_TYPE_LABELS: Record<(typeof TASK_TYPES)[number], string> = {
  maintenance: "Maintenance",
  weather: "Weather",
  health_summary: "Health summary",
};

export const WATERING_METHODS = [
  "drip",
  "flooding",
  "hose",
  "sprinkler",
] as const;

export const HARVEST_CONDITIONS = [
  "best",
  "better",
  "good",
  "pest_damage",
  "unusable",
] as const;

export const YIELD_UNITS = [
  "lb",
  "kg",
  "lug",
  "bin",
  "flat",
  "bushel",
  "other",
] as const;

export const YIELD_UNIT_LABELS: Record<(typeof YIELD_UNITS)[number], string> = {
  lb: "Pounds (lb)",
  kg: "Kilograms (kg)",
  lug: "Lug",
  bin: "Bin",
  flat: "Flat",
  bushel: "Bushel",
  other: "Other",
};

export const API_PREFIX = "/api/v1";

export function formatYield(amount: number, unit: (typeof YIELD_UNITS)[number]): string {
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} ${unit}`;
}

export function formatRowLength(feet: number, inches: number): string {
  return `${feet} ft ${inches} in`;
}

export function healthColorFromScore(
  score: number,
  thresholds: {
    greenMin: number;
    yellowMin: number;
    orangeMin: number;
  } = HEALTH_SCORE_DEFAULTS,
): (typeof HEALTH_COLORS)[number] {
  if (score >= thresholds.greenMin) return "green";
  if (score >= thresholds.yellowMin) return "yellow";
  if (score >= thresholds.orangeMin) return "orange";
  return "red";
}
