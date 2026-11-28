import type { VarietyHarvestTiming } from "./seasons.js";

export interface CalendarRuleCitation {
  id: string;
  label: string;
  source: string;
  isEstimate: boolean;
}

/**
 * Cited university guides and explicitly labeled estimates from docs/season-close-new-plan.md §4 (E2, D-10).
 */
export const SEASON_CALENDAR_RULES = {
  budBreak: {
    id: "bud_break_gdd",
    label: "150–250 GDD (base 50°F) from Jan 1",
    source: "Estimate (150–250 GDD base 50°F from Jan 1; varies by variety)",
    isEstimate: true,
    gddTarget: 200,
  },
  dormantPruning: {
    id: "dormant_pruning",
    label: "14 days before estimated bud break",
    source: "Estimate (14 days before estimated bud break)",
    isEstimate: true,
    daysBeforeBudBreak: 14,
  },
  halfWeightEarly: {
    id: "half_weight_early",
    label: "1,070–1,200 GDD (base 50°F) from Apr 1",
    source: "Michigan State Extension (1,070–1,200 GDD base 50°F from Apr 1)",
    isEstimate: false,
    gddTarget: 1135,
  },
  halfWeightMidLate: {
    id: "half_weight_mid_late",
    label: "1,470–1,700 GDD (base 50°F) from Apr 1",
    source: "Michigan State Extension (1,470–1,700 GDD base 50°F from Apr 1)",
    isEstimate: false,
    gddTarget: 1585,
  },
  bloom: {
    id: "bloom_msu",
    label: "~30 days before berries reach half weight",
    source:
      "Michigan State Extension rule of thumb (~30 days before half-weight berries)",
    isEstimate: false,
    daysBeforeHalfWeight: 30,
  },
  veraison: {
    id: "veraison_wsu",
    label: "1,670–1,760 GDD (base 50°F) from Apr 1",
    source: "Washington State research (1,670–1,760 GDD base 50°F from Apr 1)",
    isEstimate: false,
    gddTarget: 1715,
  },
  harvestEarly: {
    id: "harvest_early",
    label: "~2,200 GDD (base 50°F) from Apr 1",
    source:
      "Estimate (~2,200 GDD base 50°F from Apr 1, built from Michigan State, Washington State & Nebraska guides)",
    isEstimate: true,
    gddTarget: 2200,
  },
  harvestMid: {
    id: "harvest_mid",
    label: "~2,600 GDD (base 50°F) from Apr 1",
    source:
      "Estimate (~2,600 GDD base 50°F from Apr 1, built from Michigan State, Washington State & Nebraska guides)",
    isEstimate: true,
    gddTarget: 2600,
  },
  harvestLate: {
    id: "harvest_late",
    label: "~3,000 GDD (base 50°F) from Apr 1",
    source:
      "Estimate (~3,000 GDD base 50°F from Apr 1; Nebraska study cold-hardy hybrids 2,750–3,030 GDD)",
    isEstimate: true,
    gddTarget: 3000,
  },
  firstFallFrost: {
    id: "first_fall_frost",
    label: "After typical first fall frost (<= 32°F)",
    source: "Open-Meteo 10-year historical first fall frost",
    isEstimate: false,
  },
  lastSpringFrost: {
    id: "last_spring_frost",
    label: "Around typical last spring frost (<= 32°F)",
    source: "Open-Meteo 10-year historical last spring frost",
    isEstimate: false,
  },
} as const;

export interface VarietyTimingSuggestion {
  timing: VarietyHarvestTiming;
  source: string;
}

const WELL_KNOWN_VARIETIES: ReadonlyArray<{
  names: readonly string[];
  timing: VarietyHarvestTiming;
  source: string;
}> = [
  {
    names: ["chardonnay", "pinot noir", "concord"],
    timing: "early",
    source: "Michigan State Extension",
  },
  {
    names: ["seyval", "seyval blanc", "traminette", "merlot", "chardonel"],
    timing: "mid",
    source: "Michigan State Extension",
  },
  {
    names: ["marquette", "frontenac", "vignoles"],
    timing: "late",
    source: "Nebraska study (2,750–3,030 GDD)",
  },
  {
    names: ["norton", "cynthiana", "cabernet sauvignon"],
    timing: "late",
    source: "Extension cultivar maturity guides (late-season)",
  },
];

const SUGGESTION_LOOKUP = new Map<string, VarietyTimingSuggestion>();
for (const group of WELL_KNOWN_VARIETIES) {
  for (const name of group.names) {
    SUGGESTION_LOOKUP.set(name, { timing: group.timing, source: group.source });
  }
}

/**
 * Look up a non-binding early/mid/late suggestion for well-known grape varieties (E4).
 * Unknown varieties return null. Suggestions are NEVER auto-saved without user confirmation.
 */
export function suggestVarietyHarvestTiming(
  varietyName: string,
): VarietyTimingSuggestion | null {
  const key = varietyName.trim().toLowerCase();
  if (!key) return null;
  return SUGGESTION_LOOKUP.get(key) ?? null;
}
