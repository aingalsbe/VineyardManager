import {
  SEASON_CALENDAR_RULES,
  addCalendarDays,
  suggestVarietyHarvestTiming,
  type NewSeasonClimateSummary,
  type NewSeasonSuggestedTask,
  type NewSeasonVarietySuggestion,
  type VarietyHarvestTags,
  type VarietyHarvestTiming,
} from "@vineyard/shared";
import {
  fetchArchiveDateRange,
  geocodeAddress,
  type GeoPoint,
  type OpenMeteoHistoryDay,
} from "../weather/open-meteo.client.js";

export type ComputedClimateMilestones = {
  yearsAnalyzed: number;
  lastSpringFrostDoy: number | null;
  firstFallFrostDoy: number | null;
  budBreakDoy: number;
  bloomDoy: number;
  veraisonDoy: number;
  harvestEarlyDoy: number;
  harvestMidDoy: number;
  harvestLateDoy: number;
  summary: NewSeasonClimateSummary;
};

function dayOfYear(isoDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return 1;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const jan1 = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - jan1) / (24 * 60 * 60 * 1000)) + 1;
}

export function doyToIsoDate(year: number, doy: number): string {
  const clamped = Math.max(1, Math.min(365, Math.round(doy)));
  const ms = Date.UTC(year, 0, 1) + (clamped - 1) * 24 * 60 * 60 * 1000;
  const d = new Date(ms);
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dailyGddBase50(tempMaxF: number | null, tempMinF: number | null): number {
  if (tempMaxF == null || tempMinF == null) return 0;
  const avg = (tempMaxF + tempMinF) / 2;
  return Math.max(0, avg - 50);
}

function avgRounded(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / values.length);
}

function slugifyVariety(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "variety";
}

/** Unique per-variety slugs, in order, exactly as the location calendar assigns them. */
export function harvestSlugsForVarieties(
  varieties: readonly string[],
): Array<{ slug: string; name: string }> {
  const uniqueVarieties = [
    ...new Set(varieties.map((v) => v.trim()).filter(Boolean)),
  ];
  const usedSlugs = new Set<string>();
  const result: Array<{ slug: string; name: string }> = [];
  for (const name of uniqueVarieties) {
    let slug = slugifyVariety(name);
    if (usedSlugs.has(slug)) {
      let n = 2;
      while (usedSlugs.has(`${slug}_${n}`)) n += 1;
      slug = `${slug}_${n}`;
    }
    usedSlugs.add(slug);
    result.push({ slug, name });
  }
  return result;
}

const STRIP_WEED_PASS_1_TEXT = {
  title: "Strip / weed pass (pre-bloom)",
  body: "Keep a weed-free strip under the trellis before bloom. Avoid drift onto new shoots.",
};
const STRIP_WEED_PASS_2_TEXT = {
  title: "Strip / weed pass (midsummer)",
  body: "Second under-trellis weed pass between bloom and veraison to keep airflow open.",
};
const PEST_SCOUTING_BODY =
  "Scout canopy and clusters for insect or disease pressure; treat if pressure is up (e.g., Japanese beetles).";

function harvestWindowText(varietyName: string): { title: string; body: string } {
  return {
    title: `Harvest window — ${varietyName}`,
    body: `Start checking sugar levels (Brix) and flavor for ${varietyName}. Pick when ready; record yield on Harvests.`,
  };
}

function humanizeSlug(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Title, body and activity type for a location-calendar template key (D-B).
 * Used by POST /seasons/new when a client omits title/body. Returns null for
 * keys the location calendar does not produce with its own text.
 */
export function resolveLocationTaskDefaults(
  templateKey: string,
  varieties: readonly string[],
): {
  title: string;
  body: string;
  relatedActivityType: NewSeasonSuggestedTask["relatedActivityType"];
} | null {
  const key = templateKey.trim();
  if (key === "strip_weed_pass_1") {
    return { ...STRIP_WEED_PASS_1_TEXT, relatedActivityType: "weed_prevention" };
  }
  if (key === "strip_weed_pass_2") {
    return { ...STRIP_WEED_PASS_2_TEXT, relatedActivityType: "weed_prevention" };
  }
  const pest = /^pest_scouting_(\d+)$/.exec(key);
  if (pest) {
    return {
      title: `Pest scouting #${pest[1]}`,
      body: PEST_SCOUTING_BODY,
      relatedActivityType: "pest_prevention",
    };
  }
  if (key.startsWith("harvest_") && key !== "harvest_window") {
    const slug = key.slice("harvest_".length);
    const match = harvestSlugsForVarieties(varieties).find((v) => v.slug === slug);
    const name = match?.name ?? humanizeSlug(slug);
    return { ...harvestWindowText(name), relatedActivityType: "harvest" };
  }
  return null;
}

/**
 * Pure climate computation from multi-year daily weather history (E1).
 * Computes average last spring frost, first fall frost, and GDD base 50°F
 * milestones from Jan 1 (bud break) and Apr 1 (half weight, bloom, veraison, harvest).
 */
export function computeClimateMilestones(
  historyDays: OpenMeteoHistoryDay[],
  targetYear: number,
): ComputedClimateMilestones | null {
  const byYear = new Map<number, OpenMeteoHistoryDay[]>();
  for (const day of historyDays) {
    const year = Number(day.date.slice(0, 4));
    if (!Number.isInteger(year) || year < 1900) continue;
    const list = byYear.get(year) ?? [];
    list.push(day);
    byYear.set(year, list);
  }

  const lastSpringFrostDoys: number[] = [];
  const firstFallFrostDoys: number[] = [];
  const budBreakDoys: number[] = [];
  const bloomDoys: number[] = [];
  const veraisonDoys: number[] = [];
  const harvestEarlyDoys: number[] = [];
  const harvestMidDoys: number[] = [];
  const harvestLateDoys: number[] = [];

  let yearsAnalyzed = 0;

  for (const [, days] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (days.length < 300) continue;
    yearsAnalyzed += 1;
    const sorted = days.slice().sort((a, b) => a.date.localeCompare(b.date));

    let lastSpringFrost: number | null = null;
    let firstFallFrost: number | null = null;
    let gddJan1 = 0;
    let gddApr1 = 0;
    let budBreak: number | null = null;
    let halfWeightEarly: number | null = null;
    let veraison: number | null = null;
    let hEarly: number | null = null;
    let hMid: number | null = null;
    let hLate: number | null = null;

    for (const day of sorted) {
      const doy = dayOfYear(day.date);
      const month = Number(day.date.slice(5, 7));

      if (day.tempMinF != null && day.tempMinF <= 32) {
        if (doy <= 196) {
          lastSpringFrost = doy;
        } else if (doy >= 213 && firstFallFrost === null) {
          firstFallFrost = doy;
        }
      }

      const gdd = dailyGddBase50(day.tempMaxF, day.tempMinF);
      gddJan1 += gdd;
      if (month >= 4) {
        gddApr1 += gdd;
      }

      if (budBreak === null && gddJan1 >= SEASON_CALENDAR_RULES.budBreak.gddTarget) {
        budBreak = doy;
      }
      if (
        halfWeightEarly === null &&
        gddApr1 >= SEASON_CALENDAR_RULES.halfWeightEarly.gddTarget
      ) {
        halfWeightEarly = doy;
      }
      if (veraison === null && gddApr1 >= SEASON_CALENDAR_RULES.veraison.gddTarget) {
        veraison = doy;
      }
      if (hEarly === null && gddApr1 >= SEASON_CALENDAR_RULES.harvestEarly.gddTarget) {
        hEarly = doy;
      }
      if (hMid === null && gddApr1 >= SEASON_CALENDAR_RULES.harvestMid.gddTarget) {
        hMid = doy;
      }
      if (hLate === null && gddApr1 >= SEASON_CALENDAR_RULES.harvestLate.gddTarget) {
        hLate = doy;
      }
    }

    if (lastSpringFrost !== null) lastSpringFrostDoys.push(lastSpringFrost);
    if (firstFallFrost !== null) firstFallFrostDoys.push(firstFallFrost);
    if (budBreak !== null) budBreakDoys.push(budBreak);
    if (halfWeightEarly !== null) {
      bloomDoys.push(
        Math.max(
          (budBreak ?? 100) + 21,
          halfWeightEarly - SEASON_CALENDAR_RULES.bloom.daysBeforeHalfWeight,
        ),
      );
    }
    if (veraison !== null) veraisonDoys.push(veraison);
    if (hEarly !== null) harvestEarlyDoys.push(hEarly);
    if (hMid !== null) harvestMidDoys.push(hMid);
    if (hLate !== null) harvestLateDoys.push(hLate);
  }

  if (yearsAnalyzed === 0) return null;

  const lastSpringFrostDoy = avgRounded(lastSpringFrostDoys);
  const firstFallFrostDoy = avgRounded(firstFallFrostDoys);
  const budBreakDoy = avgRounded(budBreakDoys) ?? (lastSpringFrostDoy ? lastSpringFrostDoy - 5 : 105);
  const bloomDoy = Math.max(budBreakDoy + 25, avgRounded(bloomDoys) ?? budBreakDoy + 45);
  const veraisonDoy = Math.max(bloomDoy + 35, avgRounded(veraisonDoys) ?? bloomDoy + 55);

  const fallCap = firstFallFrostDoy ? Math.min(298, firstFallFrostDoy - 7) : 298;
  const harvestEarlyDoy = Math.min(
    fallCap - 14,
    Math.max(veraisonDoy + 21, avgRounded(harvestEarlyDoys) ?? veraisonDoy + 30),
  );
  const harvestMidDoy = Math.min(
    fallCap - 7,
    Math.max(harvestEarlyDoy + 10, avgRounded(harvestMidDoys) ?? harvestEarlyDoy + 14),
  );
  const harvestLateDoy = Math.min(
    fallCap,
    Math.max(harvestMidDoy + 10, avgRounded(harvestLateDoys) ?? harvestMidDoy + 14),
  );

  return {
    yearsAnalyzed,
    lastSpringFrostDoy,
    firstFallFrostDoy,
    budBreakDoy,
    bloomDoy,
    veraisonDoy,
    harvestEarlyDoy,
    harvestMidDoy,
    harvestLateDoy,
    summary: {
      yearsAnalyzed,
      avgLastSpringFrost:
        lastSpringFrostDoy !== null ? doyToIsoDate(targetYear, lastSpringFrostDoy) : null,
      avgFirstFallFrost:
        firstFallFrostDoy !== null ? doyToIsoDate(targetYear, firstFallFrostDoy) : null,
      estimatedBudBreak: doyToIsoDate(targetYear, budBreakDoy),
      estimatedBloom: doyToIsoDate(targetYear, bloomDoy),
      estimatedVeraison: doyToIsoDate(targetYear, veraisonDoy),
    },
  };
}

/**
 * Build variety suggestion rows for Setup & New Season preview (E4).
 * Never auto-applies suggestions into currentTag.
 */
export function buildVarietySuggestions(
  catalog: readonly string[],
  confirmedTags: VarietyHarvestTags,
): NewSeasonVarietySuggestion[] {
  return catalog.map((name) => {
    const suggestion = suggestVarietyHarvestTiming(name);
    return {
      name,
      currentTag: confirmedTags[name] ?? null,
      suggestedTag: suggestion?.timing ?? null,
      suggestionSource: suggestion?.source ?? null,
    };
  });
}

function harvestDoyForTiming(
  milestones: ComputedClimateMilestones,
  timing: VarietyHarvestTiming,
): { doy: number; source: string } {
  if (timing === "early") {
    return {
      doy: milestones.harvestEarlyDoy,
      source: SEASON_CALENDAR_RULES.harvestEarly.source,
    };
  }
  if (timing === "late") {
    return {
      doy: milestones.harvestLateDoy,
      source: SEASON_CALENDAR_RULES.harvestLate.source,
    };
  }
  return {
    doy: milestones.harvestMidDoy,
    source: SEASON_CALENDAR_RULES.harvestMid.source,
  };
}

/**
 * Pure location-based calendar builder (E2, E4, D-10, D-11, D-12, D-15).
 * Produces tasks ordered by stage with Dormant Pruning first.
 * Every task carries a rule+source citation; estimates are flagged isEstimate=true.
 */
export function buildLocationBasedSeasonCalendar(input: {
  targetYear: number;
  historyDays: OpenMeteoHistoryDay[];
  varieties: readonly string[];
  confirmedTags: VarietyHarvestTags;
}): {
  climateSummary: NewSeasonClimateSummary;
  tasks: NewSeasonSuggestedTask[];
} | null {
  const milestones = computeClimateMilestones(input.historyDays, input.targetYear);
  if (!milestones) return null;

  const y = input.targetYear;
  const budBreakDate = doyToIsoDate(y, milestones.budBreakDoy);
  const dormantPruneDate = addCalendarDays(
    budBreakDate,
    -SEASON_CALENDAR_RULES.dormantPruning.daysBeforeBudBreak,
  );
  const springFeedDate = addCalendarDays(budBreakDate, 7);
  const vineCheckBaseDoy = milestones.lastSpringFrostDoy
    ? Math.max(milestones.budBreakDoy + 10, milestones.lastSpringFrostDoy + 3)
    : milestones.budBreakDoy + 12;
  const vineCheckDate = doyToIsoDate(y, vineCheckBaseDoy);

  const bloomDate = doyToIsoDate(y, milestones.bloomDoy);
  const veraisonDate = doyToIsoDate(y, milestones.veraisonDoy);
  const weedPass1Date = addCalendarDays(bloomDate, -7);
  const weedPass2Date = doyToIsoDate(
    y,
    Math.round((milestones.bloomDoy + milestones.veraisonDoy) / 2),
  );
  const waterCheckDate = addCalendarDays(veraisonDate, -7);
  const winterizeDate = doyToIsoDate(
    y,
    milestones.firstFallFrostDoy ? milestones.firstFallFrostDoy + 7 : 314,
  );

  const tasks: NewSeasonSuggestedTask[] = [
    {
      templateKey: "dormant_prune",
      title: "Dormant prune",
      body: "Spur or cane prune before bud break. Whole vineyard unless a row is fallow.",
      stage: "dormant",
      dueDate: dormantPruneDate,
      checked: true,
      relatedActivityType: "pruning",
      source: SEASON_CALENDAR_RULES.dormantPruning.source,
      isEstimate: true,
      variety: null,
    },
    {
      templateKey: "spring_feed",
      title: "Spring feed",
      body: "Apply spring fertilizer after bud break. Follow a soil test if you have one; skip weak or newly planted vines.",
      stage: "bud_break",
      dueDate: springFeedDate,
      checked: true,
      relatedActivityType: "fertilization",
      source: `7 days after estimated bud break — ${SEASON_CALENDAR_RULES.budBreak.source}`,
      isEstimate: true,
      variety: null,
    },
    {
      templateKey: "vine_replacement_check",
      title: "Vine replacement check",
      body: "Walk rows for winter kill, frost injury, and crown gall. Mark vines to replace.",
      stage: "bud_break",
      dueDate: vineCheckDate,
      checked: true,
      relatedActivityType: "vine_replacement",
      source: milestones.lastSpringFrostDoy
        ? SEASON_CALENDAR_RULES.lastSpringFrost.source
        : SEASON_CALENDAR_RULES.budBreak.source,
      isEstimate: milestones.lastSpringFrostDoy === null,
      variety: null,
    },
    {
      templateKey: "strip_weed_pass_1",
      ...STRIP_WEED_PASS_1_TEXT,
      stage: "bloom",
      dueDate: weedPass1Date,
      checked: true,
      relatedActivityType: "weed_prevention",
      source: SEASON_CALENDAR_RULES.bloom.source,
      isEstimate: false,
      variety: null,
    },
    {
      templateKey: "strip_weed_pass_2",
      ...STRIP_WEED_PASS_2_TEXT,
      stage: "bloom_to_veraison",
      dueDate: weedPass2Date,
      checked: true,
      relatedActivityType: "weed_prevention",
      source: `${SEASON_CALENDAR_RULES.bloom.source}; ${SEASON_CALENDAR_RULES.veraison.source}`,
      isEstimate: false,
      variety: null,
    },
  ];

  // D-11: Pest scouting every 2 weeks from bloom to veraison; no spray products/rates.
  let scoutIndex = 1;
  let scoutDoy = milestones.bloomDoy;
  while (scoutDoy <= milestones.veraisonDoy && scoutIndex <= 6) {
    tasks.push({
      templateKey: `pest_scouting_${scoutIndex}`,
      title: `Pest scouting #${scoutIndex}`,
      body: PEST_SCOUTING_BODY,
      stage: "bloom_to_veraison",
      dueDate: doyToIsoDate(y, scoutDoy),
      checked: true,
      relatedActivityType: "pest_prevention",
      source: `Every 2 weeks bloom → veraison (${SEASON_CALENDAR_RULES.bloom.source}; ${SEASON_CALENDAR_RULES.veraison.source})`,
      isEstimate: false,
      variety: null,
    });
    scoutIndex += 1;
    scoutDoy += 14;
  }

  tasks.push({
    templateKey: "midsummer_watering",
    title: "Midsummer water check",
    body: "Check soil moisture and vine shoot tips ahead of veraison; run drip if the week has been dry.",
    stage: "veraison",
    dueDate: waterCheckDate,
    checked: true,
    relatedActivityType: "watering",
    source: SEASON_CALENDAR_RULES.veraison.source,
    isEstimate: false,
    variety: null,
  });

  // E2 & E4: One harvest window per variety in catalog; NEVER auto-apply suggestions.
  // Unconfirmed varieties default to the mid-season band until confirmed by the user.
  const uniqueVarieties = [
    ...new Set(input.varieties.map((v) => v.trim()).filter(Boolean)),
  ];
  if (uniqueVarieties.length === 0) {
    const mid = harvestDoyForTiming(milestones, "mid");
    tasks.push({
      templateKey: "harvest_window",
      title: "Harvest window",
      body: "Start checking sugar levels (Brix) and flavor. Pick when ready; record yield on Harvests.",
      stage: "harvest",
      dueDate: doyToIsoDate(y, mid.doy),
      checked: true,
      relatedActivityType: "harvest",
      source: mid.source,
      isEstimate: true,
      variety: null,
    });
  } else {
    for (const { slug, name: varietyName } of harvestSlugsForVarieties(
      uniqueVarieties,
    )) {
      const confirmed = input.confirmedTags[varietyName] ?? null;
      const effectiveTiming: VarietyHarvestTiming = confirmed ?? "mid";
      const band = harvestDoyForTiming(milestones, effectiveTiming);
      tasks.push({
        templateKey: `harvest_${slug}`,
        ...harvestWindowText(varietyName),
        stage: "harvest",
        dueDate: doyToIsoDate(y, band.doy),
        checked: true,
        relatedActivityType: "harvest",
        source: confirmed
          ? `${band.source} (confirmed: ${confirmed})`
          : `${band.source} (default mid-season until confirmed)`,
        isEstimate: true,
        variety: varietyName,
      });
    }
  }

  tasks.push({
    templateKey: "winterize_hill_up",
    title: "Winterize / hill up",
    body: "Hill graft unions, blow out drip lines, and put the vineyard to bed after first fall frost.",
    stage: "post_harvest",
    dueDate: winterizeDate,
    checked: true,
    relatedActivityType: "winterization",
    source: milestones.firstFallFrostDoy
      ? SEASON_CALENDAR_RULES.firstFallFrost.source
      : "Fixed fallback (post-harvest winterization)",
    isEstimate: milestones.firstFallFrostDoy === null,
    variety: null,
  });

  return {
    climateSummary: milestones.summary,
    tasks,
  };
}

type CacheEntry = {
  expiresAtMs: number;
  days: OpenMeteoHistoryDay[];
};

const CLIMATE_CACHE = new Map<string, CacheEntry>();
const CLIMATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function clearClimateHistoryCache(): void {
  CLIMATE_CACHE.clear();
}

/**
 * Fetch ~10 years of daily Open-Meteo archive history for a vineyard's location (E1, E3).
 * Cached in memory for 24h; any network/timeout/geocode failure returns null cleanly so
 * callers fall back to the fixed calendar.
 */
export async function fetchTenYearClimateHistory(
  vineyard: {
    lat: number | null;
    lng: number | null;
    address: string;
    timezone: string;
  },
  options: {
    endYear?: number;
    years?: number;
    timeoutMs?: number;
    fetchArchive?: typeof fetchArchiveDateRange;
    geocode?: typeof geocodeAddress;
  } = {},
): Promise<OpenMeteoHistoryDay[] | null> {
  const years = options.years ?? 10;
  const endYear = options.endYear ?? new Date().getUTCFullYear() - 1;
  const startYear = endYear - years + 1;
  const timeZone = vineyard.timezone || "America/Chicago";
  const timeoutMs = options.timeoutMs ?? 5_000;
  const archiveFn = options.fetchArchive ?? fetchArchiveDateRange;
  const geocodeFn = options.geocode ?? geocodeAddress;

  try {
    let point: GeoPoint | null =
      vineyard.lat != null &&
      vineyard.lng != null &&
      Number.isFinite(vineyard.lat) &&
      Number.isFinite(vineyard.lng)
        ? { lat: vineyard.lat, lng: vineyard.lng }
        : null;

    if (!point && vineyard.address.trim()) {
      point = await geocodeFn(vineyard.address);
    }
    if (!point) return null;

    const cacheKey = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}|${timeZone}|${startYear}-${endYear}`;
    const cached = CLIMATE_CACHE.get(cacheKey);
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.days;
    }

    const days = await archiveFn(
      point,
      timeZone,
      `${startYear}-01-01`,
      `${endYear}-12-31`,
      timeoutMs,
    );
    if (days.length < 300) return null;

    if (CLIMATE_CACHE.size >= 32) {
      CLIMATE_CACHE.clear();
    }
    CLIMATE_CACHE.set(cacheKey, {
      expiresAtMs: Date.now() + CLIMATE_CACHE_TTL_MS,
      days,
    });
    return days;
  } catch {
    return null;
  }
}
