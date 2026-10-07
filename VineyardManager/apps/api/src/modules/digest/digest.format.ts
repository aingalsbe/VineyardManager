/**
 * Date and plain-text helpers for the weekly digest template. No dependencies.
 *
 * Calendar dates (YYYY-MM-DD) are already in the vineyard time zone, so they
 * are parsed as calendar dates and formatted at UTC noon with timeZone "UTC".
 * That never shifts the day, whatever zone the server runs in. Instants
 * (generatedAt, startsAt) are formatted in the vineyard time zone.
 */

const DAY_MS = 86_400_000;

interface CalendarDate {
  y: number;
  m: number;
  d: number;
}

function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function calendarUtc(value: string): number | null {
  const c = parseCalendarDate(value);
  return c ? Date.UTC(c.y, c.m - 1, c.d, 12) : null;
}

/** "Mon, Oct 5" (weekday), "Oct 5", or with year when asked. */
export function formatCalendarDate(
  value: string,
  opts: { weekday?: boolean; year?: boolean } = {},
): string {
  const ms = calendarUtc(value);
  if (ms === null) return value;
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: opts.weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: opts.year ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const a = calendarUtc(from);
  const b = calendarUtc(to);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / DAY_MS);
}

export function addDays(value: string, days: number): string {
  const ms = calendarUtc(value);
  if (ms === null) return value;
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

export function sameYear(a: string, b: string): boolean {
  return a.slice(0, 4) === b.slice(0, 4);
}

function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** "Wed, Oct 7, 2026, 4:56 PM CDT" in the given zone. */
export function formatInstant(iso: string, timeZone: string, withYear = true): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
    timeZone: safeTimeZone(timeZone),
    timeZoneName: "short",
  });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Collapse whitespace (incl. newlines) so user text stays on one line. */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Word-wrap for the plain-text part. Words longer than the width are hard
 * split, except URLs, which are never broken.
 */
export function wrap(text: string, width = 72, first = "", rest = first): string[] {
  const out: string[] = [];
  let line = first;
  let lineHasWord = false;
  const prefix = () => (out.length === 0 ? first : rest);
  const push = () => {
    out.push(line.trimEnd());
    line = rest;
    lineHasWord = false;
  };
  for (const raw of oneLine(text).split(" ")) {
    if (!raw) continue;
    let word = raw;
    const isUrl = /^https?:\/\//i.test(word);
    while (true) {
      const sep = lineHasWord ? " " : "";
      if (line.length + sep.length + word.length <= width) {
        line += sep + word;
        lineHasWord = true;
        break;
      }
      if (lineHasWord) {
        push();
        continue;
      }
      const room = width - line.length;
      if (isUrl || room < 8) {
        line += word;
        lineHasWord = true;
        break;
      }
      line += word.slice(0, room);
      word = word.slice(room);
      push();
    }
  }
  if (lineHasWord || out.length === 0) out.push(line.trimEnd() || prefix().trimEnd());
  return out;
}

export function underline(title: string, char = "-"): string[] {
  return [title, char.repeat(Math.min(title.length, 72))];
}
