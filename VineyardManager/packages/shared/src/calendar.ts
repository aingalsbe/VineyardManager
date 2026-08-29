import type { ActivityType } from "./types.js";

export type AnnualCalendarTemplate = {
  title: string;
  body: string;
  month: number;
  day: number;
  relatedActivityType: ActivityType;
};

/** Stable titles so seeding twice skips duplicates. */
export const ANNUAL_CALENDAR_TEMPLATES: AnnualCalendarTemplate[] = [
  {
    title: "Dormant prune",
    body: "Spur or cane prune before bud break. Whole vineyard unless a row is fallow.",
    month: 3,
    day: 8,
    relatedActivityType: "pruning",
  },
  {
    title: "Spring feed",
    body: "Apply fertilizer after bud break. Skip weak or newly planted vines.",
    month: 4,
    day: 20,
    relatedActivityType: "fertilization",
  },
  {
    title: "Vine replacement check",
    body: "Walk for winter kill and crown gall. Mark vines to replace.",
    month: 4,
    day: 25,
    relatedActivityType: "vine_replacement",
  },
  {
    title: "Strip / weed pass",
    body: "Keep a weed-free strip under the trellis. Avoid drift onto new shoots.",
    month: 5,
    day: 15,
    relatedActivityType: "weed_prevention",
  },
  {
    title: "Pest scouting",
    body: "Scout Japanese beetles and cluster pests. Treat if pressure is up.",
    month: 6,
    day: 15,
    relatedActivityType: "pest_prevention",
  },
  {
    title: "Midsummer watering",
    body: "Check soil moisture and run drip if the week has been dry.",
    month: 7,
    day: 15,
    relatedActivityType: "watering",
  },
  {
    title: "Harvest window",
    body: "Watch Brix and flavor. Pick when ready; record yield on Harvests.",
    month: 9,
    day: 10,
    relatedActivityType: "harvest",
  },
  {
    title: "Winterize / hill up",
    body: "Hill graft unions, blow out drip lines, and put the vineyard to bed.",
    month: 11,
    day: 10,
    relatedActivityType: "winterization",
  },
];

export function annualCalendarDueDate(
  year: number,
  month: number,
  day: number,
): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
