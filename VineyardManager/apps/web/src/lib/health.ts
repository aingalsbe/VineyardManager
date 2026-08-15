import type { HealthColor } from "@vineyard/shared";
import { HEALTH_SCORE_DEFAULTS } from "@vineyard/shared";

export const healthSwatch: Record<HealthColor, string> = {
  green: "bg-health-green",
  yellow: "bg-health-yellow",
  orange: "bg-health-orange",
  red: "bg-health-red",
};

export const healthRangeLabel: Record<HealthColor, string> = {
  green: `${HEALTH_SCORE_DEFAULTS.greenMin}–100`,
  yellow: `${HEALTH_SCORE_DEFAULTS.yellowMin}–${HEALTH_SCORE_DEFAULTS.greenMin - 1}`,
  orange: `${HEALTH_SCORE_DEFAULTS.orangeMin}–${HEALTH_SCORE_DEFAULTS.yellowMin - 1}`,
  red: `< ${HEALTH_SCORE_DEFAULTS.orangeMin}`,
};

export const healthMeaning: Record<HealthColor, string> = {
  green: "Healthy, no major actions",
  yellow: "Potential actions",
  orange: "Action needed soon",
  red: "Immediate attention",
};
