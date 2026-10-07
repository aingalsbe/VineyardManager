/**
 * Weekly digest data contract. The template (digest.template.ts) imports only
 * this type; the builder (digest.service.ts) produces it.
 */
import type {
  HealthColor,
  TaskStatus,
  WeatherAlertSeverity,
  WeatherHazard,
} from "@vineyard/shared";

export interface DigestTask {
  id: string;
  title: string;
  /** YYYY-MM-DD in the vineyard time zone. */
  dueDate: string;
  status: TaskStatus;
  /** "NS3 Merlot", "Removed row", or null for whole-vineyard tasks. */
  rowLabel: string | null;
  removedRow: boolean;
}

export interface DigestWeatherDay {
  date: string;
  summary: string;
  tempMaxF: number;
  tempMinF: number;
  precipInches: number;
  precipProbabilityPct: number | null;
}

export interface DigestWeatherAlert {
  hazard: WeatherHazard;
  severity: WeatherAlertSeverity;
  title: string;
  description: string;
  startsAt: string | null;
}

export interface DigestData {
  vineyard: { id: string; name: string; timeZone: string };
  /** Monday of the digest week, YYYY-MM-DD in the vineyard time zone. */
  weekStart: string;
  /** "Today" used for overdue / next-7-days math, YYYY-MM-DD (vineyard TZ). */
  asOfDate: string;
  generatedAt: string;
  /** Base web URL for links (APP_URL). */
  appUrl: string;
  tasks: {
    /** Open (pending | sent) tasks due before asOfDate. Matches the Dashboard overdue count. */
    overdueCount: number;
    /** Open tasks due asOfDate .. asOfDate+6. */
    upcomingCount: number;
    /** Lists are capped (see listLimit); counts are exact. */
    overdue: DigestTask[];
    upcoming: DigestTask[];
    listLimit: number;
  };
  weather: {
    available: boolean;
    /** Set when weather could not be loaded (digest still renders). */
    unavailableReason: string | null;
    alerts: DigestWeatherAlert[];
    outlook: DigestWeatherDay[];
  };
  health: {
    score: number;
    color: HealthColor;
    /** Top 3 vineyard reasons. */
    reasons: Array<{ message: string; severity: HealthColor }>;
  };
}

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}
