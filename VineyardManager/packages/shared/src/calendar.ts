import type { CalendarStage } from "./seasons.js";
import type { ActivityType } from "./types.js";

export type AnnualCalendarTemplate = {
  templateKey: string;
  title: string;
  body: string;
  month: number;
  day: number;
  stage: CalendarStage;
  relatedActivityType: ActivityType;
};

/** Stable template keys and titles for annual work calendar seeding and fallback. */
export const ANNUAL_CALENDAR_TEMPLATES: AnnualCalendarTemplate[] = [
  {
    templateKey: "dormant_prune",
    title: "Dormant prune",
    body: "Spur or cane prune before bud break. Whole vineyard unless a row is fallow.",
    month: 3,
    day: 8,
    stage: "dormant",
    relatedActivityType: "pruning",
  },
  {
    templateKey: "spring_feed",
    title: "Spring feed",
    body: "Apply fertilizer after bud break. Follow a soil test if you have one; skip weak or newly planted vines.",
    month: 4,
    day: 20,
    stage: "bud_break",
    relatedActivityType: "fertilization",
  },
  {
    templateKey: "vine_replacement_check",
    title: "Vine replacement check",
    body: "Walk for winter kill and crown gall. Mark vines to replace.",
    month: 4,
    day: 25,
    stage: "bud_break",
    relatedActivityType: "vine_replacement",
  },
  {
    templateKey: "strip_weed_pass",
    title: "Strip / weed pass",
    body: "Keep a weed-free strip under the trellis. Avoid drift onto new shoots.",
    month: 5,
    day: 15,
    stage: "bloom",
    relatedActivityType: "weed_prevention",
  },
  {
    templateKey: "pest_scouting",
    title: "Pest scouting",
    body: "Scout Japanese beetles and cluster pests. Treat if pressure is up (e.g., Japanese beetles).",
    month: 6,
    day: 15,
    stage: "bloom_to_veraison",
    relatedActivityType: "pest_prevention",
  },
  {
    templateKey: "midsummer_watering",
    title: "Midsummer watering",
    body: "Check soil moisture and run drip if the week has been dry.",
    month: 7,
    day: 15,
    stage: "veraison",
    relatedActivityType: "watering",
  },
  {
    templateKey: "harvest_window",
    title: "Harvest window",
    body: "Start checking sugar levels (Brix) and flavor. Pick when ready; record yield on Harvests.",
    month: 9,
    day: 10,
    stage: "harvest",
    relatedActivityType: "harvest",
  },
  {
    templateKey: "winterize_hill_up",
    title: "Winterize / hill up",
    body: "Hill graft unions, blow out drip lines, and put the vineyard to bed.",
    month: 11,
    day: 10,
    stage: "post_harvest",
    relatedActivityType: "winterization",
  },
];

/**
 * Task-key family for equivalence between the fixed annual calendar and the
 * location-based New Season calendar. The two use different keys for the same
 * kind of work (for example fixed `strip_weed_pass` vs location
 * `strip_weed_pass_1` / `strip_weed_pass_2`; fixed `harvest_window` vs
 * location `harvest_<variety>`), so de-duplication compares families.
 * Keys with no known alias are their own family.
 */
export function calendarTemplateFamily(templateKey: string): string {
  const key = templateKey.trim();
  if (/^strip_weed_pass(_\d+)?$/.test(key)) return "strip_weed_pass";
  if (/^pest_scouting(_\d+)?$/.test(key)) return "pest_scouting";
  if (key === "harvest_window" || key.startsWith("harvest_")) return "harvest";
  return key;
}

export const CALENDAR_TEMPLATES: AnnualCalendarTemplate[] =
  ANNUAL_CALENDAR_TEMPLATES;

export function annualCalendarDueDate(
  year: number,
  month: number,
  day: number,
): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

const NOON_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getWallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = NOON_FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    if (NOON_FORMATTER_CACHE.size >= 64) {
      NOON_FORMATTER_CACHE.clear();
    }
    NOON_FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

function localWallClockAsUtcMs(instantMs: number, timeZone: string): number {
  const parts = getWallClockFormatter(timeZone).formatToParts(new Date(instantMs));
  let year = 0;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === "year") year = Number(part.value);
    else if (part.type === "month") month = Number(part.value);
    else if (part.type === "day") day = Number(part.value);
    else if (part.type === "hour") hour = Number(part.value) % 24;
    else if (part.type === "minute") minute = Number(part.value);
  }
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

/**
 * Convert a calendar date (YYYY-MM-DD) in an IANA time zone to the UTC Date
 * representing 12:00 local time in that zone (never server-local time).
 */
export function localNoonInZone(isoDate: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    throw new RangeError(`Invalid calendar date: ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const targetLocalMs = Date.UTC(year, month - 1, day, 12, 0, 0, 0);

  let guess = targetLocalMs;
  for (let i = 0; i < 2; i += 1) {
    const observedLocalMs = localWallClockAsUtcMs(guess, timeZone);
    const diff = observedLocalMs - targetLocalMs;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}
