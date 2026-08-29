import type { ActivityType } from "@vineyard/shared";

export const CHART_PRIMARY = "#215a96";
export const CHART_GRID = "#cfd7e1";
export const CHART_TICK = "#5a6573";
export const CHART_AXIS = "#122033";

export const HEALTH_BAND = {
  green: "#2f7d4a",
  yellow: "#c4a035",
  orange: "#c46a2f",
  red: "#b33b32",
} as const;

export const ACTIVITY_CHART_COLORS: Record<ActivityType, string> = {
  pruning: "#215a96",
  watering: "#4d8ec4",
  fertilization: "#1d6a6a",
  pest_prevention: "#6b5a96",
  weed_prevention: "#3d6a8a",
  harvest: "#5a6573",
  health_observation: "#3d4a5c",
  vine_replacement: "#7a5a3d",
  winterization: "#2a4a73",
  other: "#122033",
};

export const chartTooltipStyle = {
  background: "#ffffff",
  border: "1px solid #cfd7e1",
  borderRadius: 8,
  fontSize: 14,
  color: "#122033",
};
