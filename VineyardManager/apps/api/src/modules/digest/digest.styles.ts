/**
 * Design tokens for the weekly digest email (digest.template.ts).
 * Email clients need literal values, so these are plain strings, not CSS
 * variables. Palette mirrors apps/web/src/index.css.
 */

export const COLOR = {
  primary: "#215a96",
  page: "#eef2f6",
  card: "#ffffff",
  tint: "#f4f7fb",
  ink: "#122033",
  muted: "#5a6573",
  border: "#cfd7e1",
  onPrimary: "#ffffff",
  onPrimarySoft: "#dbe6f3",
} as const;

export const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Lets long unbroken strings wrap instead of widening the layout. */
export const WRAP = "word-break:break-word;overflow-wrap:anywhere;";

export interface HealthTone {
  bg: string;
  fg: string;
  /** Same wording as healthMeaning in apps/web/src/lib/health.ts. */
  label: string;
}

/**
 * Traffic colors: used ONLY on the health score pill. Text/background pairs
 * are all >= 4.5:1. Orange is a touch lighter than the app swatch (#c46a2f)
 * because neither white (3.85) nor ink (4.26) passes on the app orange.
 */
export const HEALTH_TONE: Record<string, HealthTone> = {
  green: { bg: "#2f7d4a", fg: "#ffffff", label: "Healthy, no major actions" }, // 5.06:1
  yellow: { bg: "#c4a035", fg: "#122033", label: "Potential actions" }, // 6.58:1
  orange: { bg: "#d27838", fg: "#122033", label: "Action needed soon" }, // 5.07:1
  red: { bg: "#b33b32", fg: "#ffffff", label: "Immediate attention" }, // 5.85:1
};

export const FALLBACK_HEALTH_TONE: HealthTone = {
  bg: COLOR.primary,
  fg: COLOR.onPrimary,
  label: "Health score",
};

/** Mirrors TASK_STATUS_LABELS in packages/shared (kept local: template imports only types). */
export const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "Not started",
  sent: "In progress",
  acknowledged: "Complete",
  dismissed: "Dismissed",
};

/** Mirrors WEATHER_HAZARD_LABELS in packages/shared. */
export const HAZARD_LABEL: Record<string, string> = {
  hail: "Hail",
  wind: "Wind",
  tornado: "Tornado",
  rain: "Rain",
  snow: "Snow",
  frost: "Frost",
  drought: "Drought",
};

export const SEVERITY_LABEL: Record<string, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
  extreme: "Extreme",
};

export const SEVERITY_RANK: Record<string, number> = {
  minor: 1,
  moderate: 2,
  severe: 3,
  extreme: 4,
};

/** Optional enhancement only: the layout must already work without it. */
export const RESPONSIVE_CSS = `@media only screen and (max-width:600px){
.vm-outer{padding:0 !important;}
.vm-card{border-left:0 !important;border-right:0 !important;border-radius:0 !important;}
.vm-px{padding-left:16px !important;padding-right:16px !important;}
.vm-h1{font-size:20px !important;line-height:26px !important;}
}`;
