import { ACTIVITY_TYPES, healthColorFromScore } from "./constants.js";
import { addCalendarDays, calendarDateInZone, scoreVineyardHealth } from "./health.js";
import type {
  ActivityType,
  HealthScoreActivityInput,
  HealthScoreTaskInput,
  HealthThresholds,
  MetricsPeriod,
  MetricsPoint,
  RowStatus,
  VineyardMetrics,
  YieldUnit,
} from "./types.js";

const FIELD_STATUSES: ReadonlySet<RowStatus> = new Set([
  "active",
  "fallow",
  "replanting",
]);

const KG_TO_LB = 2.20462;

export type MetricsRowInput = {
  id: string;
  code: string;
  name: string;
  variety: string;
  status: RowStatus;
};

export type MetricsHarvestInput = {
  rowId: string;
  harvestedAt: string;
  yieldAmount: number;
  yieldUnit: YieldUnit;
};

export function varietyKey(name: string): string {
  return name.trim().toLowerCase();
}

export function displayVariety(name: string, catalog: string[]): string {
  const key = varietyKey(name);
  if (!key) return "Unknown";
  const match = catalog.find((item) => varietyKey(item) === key);
  return match ?? name.trim();
}

export function yieldToLb(amount: number, unit: YieldUnit): number | null {
  if (unit === "lb") return amount;
  if (unit === "kg") return amount * KG_TO_LB;
  return null;
}

export function periodRange(
  asOf: Date,
  period: MetricsPeriod,
  timeZone: string,
): { start: string; end: string } {
  const end = calendarDateInZone(asOf, timeZone);
  const [year, month] = end.split("-").map(Number);
  const y = year ?? 1970;
  const m = month ?? 1;
  if (period === "month") {
    return { start: `${y}-${pad2(m)}-01`, end };
  }
  if (period === "quarter") {
    const quarterStart = Math.floor((m - 1) / 3) * 3 + 1;
    return { start: `${y}-${pad2(quarterStart)}-01`, end };
  }
  return { start: `${y}-01-01`, end };
}

export function shiftIsoDateYears(isoDate: string, years: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const y = (year ?? 1970) + years;
  const m = month ?? 1;
  const d = day ?? 1;
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCMonth() !== m - 1) {
    const last = new Date(Date.UTC(y, m, 0));
    return last.toISOString().slice(0, 10);
  }
  return utc.toISOString().slice(0, 10);
}

export function sampleDates(
  start: string,
  end: string,
  period: MetricsPeriod,
): string[] {
  const step = period === "month" ? 1 : 7;
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addCalendarDays(current, step);
  }
  if (dates.length === 0 || dates[dates.length - 1] !== end) {
    dates.push(end);
  }
  return dates;
}

export function groupRowsByVariety(
  rows: MetricsRowInput[],
  catalog: string[],
): Array<{ key: string; variety: string; rows: MetricsRowInput[] }> {
  const groups = new Map<
    string,
    { variety: string; rows: MetricsRowInput[] }
  >();
  for (const row of rows) {
    const key = varietyKey(row.variety) || "unknown";
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, {
        variety: displayVariety(row.variety, catalog),
        rows: [row],
      });
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, ...group }))
    .sort((a, b) => a.variety.localeCompare(b.variety));
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function roundLb(value: number): number {
  return Math.round(value * 100) / 100;
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function bumpType(
  counts: Map<ActivityType, number>,
  type: ActivityType,
): void {
  counts.set(type, (counts.get(type) ?? 0) + 1);
}

function typeCountsFromMap(
  counts: Map<ActivityType, number>,
): Array<{ activityType: ActivityType; count: number }> {
  return ACTIVITY_TYPES.map((activityType) => ({
    activityType,
    count: counts.get(activityType) ?? 0,
  }));
}

function bucketDate(isoDate: string, samples: string[]): string {
  let bucket = samples[0] ?? isoDate;
  for (const sample of samples) {
    if (sample <= isoDate) bucket = sample;
    else break;
  }
  return bucket;
}

function seriesFromBuckets(
  buckets: Map<string, Map<ActivityType, number>> | undefined,
  dates: string[],
): Array<{ date: string; activityType: ActivityType; count: number }> {
  const points: Array<{
    date: string;
    activityType: ActivityType;
    count: number;
  }> = [];
  if (!buckets) return points;
  for (const date of dates) {
    const types = buckets.get(date);
    if (!types) continue;
    for (const activityType of ACTIVITY_TYPES) {
      const count = types.get(activityType) ?? 0;
      if (count > 0) {
        points.push({ date, activityType, count });
      }
    }
  }
  return points;
}

export function buildVineyardMetrics(input: {
  vineyardId: string;
  timeZone: string;
  catalog: string[];
  healthThresholds?: HealthThresholds | null;
  asOf: Date;
  period: MetricsPeriod;
  rows: MetricsRowInput[];
  tasks: HealthScoreTaskInput[];
  activities: HealthScoreActivityInput[];
  harvests: MetricsHarvestInput[];
}): VineyardMetrics {
  const range = periodRange(input.asOf, input.period, input.timeZone);
  const prior = {
    start: shiftIsoDateYears(range.start, -1),
    end: shiftIsoDateYears(range.end, -1),
  };
  const dates = sampleDates(range.start, range.end, input.period);
  const varietyGroups = groupRowsByVariety(input.rows, input.catalog);
  const rowById = new Map(input.rows.map((row) => [row.id, row]));

  const scoreAt = (asOfDate: string) =>
    scoreVineyardHealth({
      rows: input.rows,
      tasks: input.tasks,
      activities: input.activities,
      healthThresholds: input.healthThresholds,
      asOf: new Date(`${asOfDate}T12:00:00.000Z`),
      timeZone: input.timeZone,
    });

  const current = scoreAt(range.end);
  const seriesByRow = new Map<string, MetricsPoint[]>();
  for (const row of input.rows) seriesByRow.set(row.id, []);
  const vineyardSeries: MetricsPoint[] = [];
  const varietySeries = new Map<string, MetricsPoint[]>();
  for (const group of varietyGroups) varietySeries.set(group.key, []);

  for (const date of dates) {
    const scored = scoreAt(date);
    vineyardSeries.push({
      date,
      score: scored.vineyard.score,
      color: scored.vineyard.color,
    });
    const scoreById = new Map(scored.rows.map((row) => [row.rowId, row]));
    for (const row of input.rows) {
      const item = scoreById.get(row.id);
      seriesByRow.get(row.id)?.push({
        date,
        score: item?.score ?? 0,
        color: item?.color ?? "red",
      });
    }
    for (const group of varietyGroups) {
      const field = group.rows.filter((row) => FIELD_STATUSES.has(row.status));
      const members = field.length > 0 ? field : group.rows;
      const average =
        members.length === 0
          ? 100
          : members.reduce((sum, row) => {
              const item = scoreById.get(row.id);
              return sum + (item?.score ?? 0);
            }, 0) / members.length;
      const score = Math.round(average);
      varietySeries.get(group.key)?.push({
        date,
        score,
        color: healthColorFromScore(score, input.healthThresholds ?? undefined),
      });
    }
  }

  const currentById = new Map(current.rows.map((row) => [row.rowId, row]));

  let skippedNonLb = 0;
  const usableHarvests: Array<{
    row: MetricsRowInput;
    year: number;
    date: string;
    amount: number;
  }> = [];
  for (const harvest of input.harvests) {
    const row = rowById.get(harvest.rowId);
    if (!row) continue;
    const amount = yieldToLb(harvest.yieldAmount, harvest.yieldUnit);
    if (amount == null) {
      skippedNonLb += 1;
      continue;
    }
    const date = calendarDateInZone(
      new Date(harvest.harvestedAt),
      input.timeZone,
    );
    usableHarvests.push({
      row,
      year: Number(date.slice(0, 4)),
      date,
      amount,
    });
  }

  const years = [...new Set(usableHarvests.map((item) => item.year))].sort(
    (a, b) => a - b,
  );

  const currentTotal = roundLb(
    usableHarvests
      .filter((item) => inRange(item.date, range.start, range.end))
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const priorTotal = roundLb(
    usableHarvests
      .filter((item) => inRange(item.date, prior.start, prior.end))
      .reduce((sum, item) => sum + item.amount, 0),
  );

  const harvestsByRow = input.rows.map((row) => {
    const items = usableHarvests.filter((item) => item.row.id === row.id);
    const byYear = years.map((year) => ({
      year,
      amount: roundLb(
        items
          .filter((item) => item.year === year)
          .reduce((sum, item) => sum + item.amount, 0),
      ),
    }));
    return {
      rowId: row.id,
      code: row.code,
      name: row.name,
      variety: displayVariety(row.variety, input.catalog),
      total: roundLb(items.reduce((sum, item) => sum + item.amount, 0)),
      byYear,
    };
  });

  const harvestsByVariety = varietyGroups.map((group) => {
    const ids = new Set(group.rows.map((row) => row.id));
    const items = usableHarvests.filter((item) => ids.has(item.row.id));
    const byYear = years.map((year) => ({
      year,
      amount: roundLb(
        items
          .filter((item) => item.year === year)
          .reduce((sum, item) => sum + item.amount, 0),
      ),
    }));
    return {
      variety: group.variety,
      rowCodes: group.rows.map((row) => row.code),
      total: roundLb(items.reduce((sum, item) => sum + item.amount, 0)),
      byYear,
    };
  });

  const harvestYears = years.map((year) => {
    const items = usableHarvests.filter((item) => item.year === year);
    const byRow = input.rows.map((row) => ({
      rowId: row.id,
      code: row.code,
      amount: roundLb(
        items
          .filter((item) => item.row.id === row.id)
          .reduce((sum, item) => sum + item.amount, 0),
      ),
    }));
    const byVariety = varietyGroups.map((group) => {
      const ids = new Set(group.rows.map((row) => row.id));
      return {
        variety: group.variety,
        amount: roundLb(
          items
            .filter((item) => ids.has(item.row.id))
            .reduce((sum, item) => sum + item.amount, 0),
        ),
      };
    });
    return {
      year,
      total: roundLb(items.reduce((sum, item) => sum + item.amount, 0)),
      byRow,
      byVariety,
    };
  });

  const activityDate = (iso: string) =>
    calendarDateInZone(new Date(iso), input.timeZone);

  const inPeriod = input.activities.filter((activity) =>
    inRange(activityDate(activity.performedAt), range.start, range.end),
  );

  const vineyardCounts = new Map<ActivityType, number>();
  const seriesCounts = new Map<string, Map<ActivityType, number>>();
  const rowCounts = new Map<string, Map<ActivityType, number>>();
  const rowSeries = new Map<string, Map<string, Map<ActivityType, number>>>();
  for (const row of input.rows) {
    rowCounts.set(row.id, new Map());
    rowSeries.set(row.id, new Map());
  }

  for (const activity of inPeriod) {
    bumpType(vineyardCounts, activity.activityType);
    const bucket = bucketDate(activityDate(activity.performedAt), dates);
    const seriesMap = seriesCounts.get(bucket) ?? new Map();
    bumpType(seriesMap, activity.activityType);
    seriesCounts.set(bucket, seriesMap);
    if (activity.scopeType === "row" && activity.rowId) {
      const map = rowCounts.get(activity.rowId);
      if (map) bumpType(map, activity.activityType);
      const buckets = rowSeries.get(activity.rowId);
      if (buckets) {
        const bucketMap = buckets.get(bucket) ?? new Map();
        bumpType(bucketMap, activity.activityType);
        buckets.set(bucket, bucketMap);
      }
    }
  }

  const activitySeries: VineyardMetrics["activities"]["series"] = [];
  for (const date of dates) {
    const map = seriesCounts.get(date) ?? new Map();
    for (const activityType of ACTIVITY_TYPES) {
      const count = map.get(activityType) ?? 0;
      if (count > 0) {
        activitySeries.push({ date, activityType, count });
      }
    }
  }

  return {
    vineyardId: input.vineyardId,
    asOf: input.asOf.toISOString(),
    period: input.period,
    range,
    health: {
      current: current.vineyard,
      series: vineyardSeries,
      rows: input.rows.map((row) => {
        const scored = currentById.get(row.id);
        return {
          rowId: row.id,
          code: row.code,
          name: row.name,
          variety: displayVariety(row.variety, input.catalog),
          score: scored?.score ?? 0,
          color: scored?.color ?? "red",
          series: seriesByRow.get(row.id) ?? [],
        };
      }),
      varieties: varietyGroups.map((group) => {
        const series = varietySeries.get(group.key) ?? [];
        const latest = series[series.length - 1];
        return {
          variety: group.variety,
          rowCodes: group.rows.map((row) => row.code),
          score: latest?.score ?? 0,
          color: latest?.color ?? "red",
          series,
        };
      }),
    },
    harvests: {
      unit: "lb",
      currentTotal,
      priorTotal,
      skippedNonLb,
      years: harvestYears,
      byRow: harvestsByRow,
      byVariety: harvestsByVariety,
    },
    activities: {
      byType: typeCountsFromMap(vineyardCounts),
      series: activitySeries,
      byRow: input.rows.map((row) => ({
        rowId: row.id,
        code: row.code,
        name: row.name,
        byType: typeCountsFromMap(rowCounts.get(row.id) ?? new Map()),
        series: seriesFromBuckets(rowSeries.get(row.id), dates),
      })),
      byVariety: varietyGroups.map((group) => {
        const merged = new Map<ActivityType, number>();
        const mergedSeries = new Map<string, Map<ActivityType, number>>();
        for (const row of group.rows) {
          const counts = rowCounts.get(row.id);
          if (counts) {
            for (const [type, count] of counts) {
              merged.set(type, (merged.get(type) ?? 0) + count);
            }
          }
          const buckets = rowSeries.get(row.id);
          if (!buckets) continue;
          for (const [date, types] of buckets) {
            const slot = mergedSeries.get(date) ?? new Map();
            for (const [type, count] of types) {
              slot.set(type, (slot.get(type) ?? 0) + count);
            }
            mergedSeries.set(date, slot);
          }
        }
        return {
          variety: group.variety,
          rowCodes: group.rows.map((row) => row.code),
          byType: typeCountsFromMap(merged),
          series: seriesFromBuckets(mergedSeries, dates),
        };
      }),
    },
  };
}


