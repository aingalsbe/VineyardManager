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

export const healthBarText: Record<HealthColor, string> = {
  green: "text-white",
  yellow: "text-foreground",
  orange: "text-white",
  red: "text-white",
};

/** Neutral swatch for dormant vineyards (Sage P2 #10): not a health color. */
export const DORMANT_SWATCH = "bg-card ring-2 ring-inset ring-muted";

/** True when the API marked this health result as dormant (A8, D-20). */
export function isDormantHealth(
  health: { reasons?: ReadonlyArray<{ code: string }> } | null | undefined,
): boolean {
  return Boolean(health?.reasons?.some((reason) => reason.code === "vineyard_dormant"));
}
