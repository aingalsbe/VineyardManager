/**
 * Weekly digest email template. Plain TS string builders, no dependencies.
 *
 * Email-safe HTML: nested role=presentation tables, 600px fluid card, inline
 * styles + bgcolor attributes, system fonts, no images/JS/external CSS. The
 * optional <style> block only tightens padding on small screens; the layout
 * works without it (Gmail apps may drop it).
 *
 * Color rules: cool blue palette everywhere. Traffic colors (green / yellow /
 * orange / red) appear ONLY on the health score pill, always with the score
 * and a text label. Overdue tasks and weather alerts use blue/neutral styling
 * with text wording.
 */
import type { DigestData } from "./digest.types.js";
import {
  addDays,
  daysBetween,
  formatCalendarDate,
  formatInstant,
  oneLine,
  plural,
  sameYear,
  underline,
  wrap,
} from "./digest.format.js";
import {
  COLOR,
  FALLBACK_HEALTH_TONE,
  FONT,
  HAZARD_LABEL,
  HEALTH_TONE,
  RESPONSIVE_CSS,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  TASK_STATUS_LABEL,
  WRAP,
  type HealthTone,
} from "./digest.styles.js";

type DigestTask = DigestData["tasks"]["overdue"][number];
type DigestAlert = DigestData["weather"]["alerts"][number];
type DigestDay = DigestData["weather"]["outlook"][number];

const SUBJECT_TARGET = 70;
const MIDDOT = "\u00b7";
const DEG = "\u00b0";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------- wording

function healthTone(color: string): HealthTone {
  return HEALTH_TONE[color] ?? FALLBACK_HEALTH_TONE;
}

function hazardLabel(hazard: string): string {
  return HAZARD_LABEL[hazard] ?? oneLine(hazard);
}

function severityLabel(severity: string): string {
  return SEVERITY_LABEL[severity] ?? oneLine(severity);
}

/** Most severe alert (first one wins ties), for subject and preheader. */
function topAlert(alerts: DigestAlert[]): DigestAlert | null {
  let best: DigestAlert | null = null;
  for (const a of alerts) {
    if (!best || (SEVERITY_RANK[a.severity] ?? 0) > (SEVERITY_RANK[best.severity] ?? 0)) best = a;
  }
  return best;
}

function dueDate(iso: string, asOf: string, weekday: boolean): string {
  return formatCalendarDate(iso, { weekday, year: !sameYear(iso, asOf) });
}

/** "Due Oct 2 · 5 days overdue" / "Due today · Wed, Oct 7" / "Due Fri, Oct 9 · in 2 days". */
function dueWording(task: DigestTask, asOf: string, kind: "overdue" | "upcoming"): string {
  const diff = daysBetween(asOf, task.dueDate);
  if (kind === "overdue" || diff < 0) {
    const late = Math.max(1, -diff);
    return `Due ${dueDate(task.dueDate, asOf, false)} ${MIDDOT} ${plural(late, "day")} overdue`;
  }
  const date = dueDate(task.dueDate, asOf, true);
  if (diff === 0) return `Due today ${MIDDOT} ${date}`;
  if (diff === 1) return `Due tomorrow ${MIDDOT} ${date}`;
  return `Due ${date} ${MIDDOT} in ${diff} days`;
}

function locationLabel(task: DigestTask): string {
  if (task.removedRow) return task.rowLabel ? oneLine(task.rowLabel) : "Removed row";
  return task.rowLabel ? oneLine(task.rowLabel) : "Whole vineyard";
}

/** Only non-default statuses are worth showing ("In progress"). */
function statusLabel(task: DigestTask): string | null {
  if (task.status === "pending") return null;
  return TASK_STATUS_LABEL[task.status] ?? oneLine(task.status);
}

function taskCountLabel(tasks: DigestData["tasks"], short: boolean): string {
  if (tasks.overdueCount > 0) {
    return short
      ? `${tasks.overdueCount} overdue`
      : plural(tasks.overdueCount, "overdue task");
  }
  if (tasks.upcomingCount > 0) return `${plural(tasks.upcomingCount, "task")} due this week`;
  return "All caught up on tasks";
}

function buildSubject(data: DigestData): string {
  const { tasks, health, weather } = data;
  const name = oneLine(data.vineyard.name);
  const alert = weather.available ? topAlert(weather.alerts) : null;
  const alertPart = alert ? `${hazardLabel(alert.hazard)} alert` : null;
  const urgentAlert = alert ? (SEVERITY_RANK[alert.severity] ?? 0) >= 3 : false;

  const compose = (short: boolean, vineyardName: string): string => {
    const parts = [taskCountLabel(tasks, short), `Health ${health.score}`];
    if (alertPart) {
      if (urgentAlert) parts.unshift(alertPart);
      else parts.push(alertPart);
    }
    parts.push(vineyardName);
    return parts.join(` ${MIDDOT} `);
  };

  let subject = compose(false, name);
  if (subject.length <= SUBJECT_TARGET) return subject;
  subject = compose(true, name);
  if (subject.length <= SUBJECT_TARGET) return subject;
  const room = SUBJECT_TARGET - compose(true, "").length;
  if (room >= 12 && room < name.length) return compose(true, `${name.slice(0, room - 1).trimEnd()}\u2026`);
  return subject;
}

function buildPreheader(data: DigestData): string {
  const { tasks, health, weather } = data;
  const parts: string[] = [];
  if (tasks.overdueCount === 0 && tasks.upcomingCount === 0) {
    parts.push("All caught up on tasks");
  } else {
    parts.push(plural(tasks.overdueCount, "overdue task"));
    parts.push(
      tasks.upcomingCount === 0 ? "nothing due this week" : `${tasks.upcomingCount} due this week`,
    );
  }
  parts.push(`Health ${health.score}, ${healthTone(health.color).label.toLowerCase()}`);
  if (!weather.available) parts.push("weather unavailable");
  else {
    const alert = topAlert(weather.alerts);
    if (alert) {
      const more = weather.alerts.length > 1 ? ` (+${weather.alerts.length - 1} more)` : "";
      parts.push(`${severityLabel(alert.severity)} alert: ${oneLine(alert.title)}${more}`);
    } else parts.push("no weather alerts");
  }
  return parts.join(` ${MIDDOT} `);
}

// ---------------------------------------------------------------- html bits

const BASE_TEXT = `font-family:${FONT};color:${COLOR.ink};${WRAP}`;

function spacer(height: number): string {
  return `<tr><td height="${height}" style="height:${height}px;line-height:${height}px;font-size:1px;">&nbsp;</td></tr>`;
}

function sectionHeading(title: string, note?: string): string {
  const noteHtml = note
    ? ` <span style="font-size:13px;font-weight:400;color:${COLOR.muted};">${esc(note)}</span>`
    : "";
  return `<tr><td class="vm-px" style="padding:24px 24px 4px 24px;border-top:1px solid ${COLOR.border};${BASE_TEXT}font-size:18px;line-height:24px;font-weight:700;">${esc(title)}${noteHtml}</td></tr>`;
}

function subHeading(title: string, note?: string, topPad = 16): string {
  const noteHtml = note
    ? ` <span style="font-weight:400;color:${COLOR.muted};">${esc(note)}</span>`
    : "";
  return `<tr><td style="padding:${topPad}px 0 8px 0;${BASE_TEXT}font-size:14px;line-height:20px;font-weight:700;">${esc(title)}${noteHtml}</td></tr>`;
}

/** Neutral notice box used for empty / unavailable states. */
function notice(main: string, detail?: string): string {
  const detailHtml = detail
    ? `<br><span style="font-size:13px;line-height:20px;color:${COLOR.muted};">${detail}</span>`
    : "";
  return `<tr><td bgcolor="${COLOR.tint}" style="background-color:${COLOR.tint};border:1px solid ${COLOR.border};border-radius:6px;padding:12px 14px;${BASE_TEXT}font-size:14px;line-height:20px;">${main}${detailHtml}</td></tr>`;
}

/** Wrap rows in a full-width fixed-layout table (keeps long text from widening it). */
function block(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:separate;">${rows}</table>`;
}

function healthHtml(data: DigestData): string {
  const { health } = data;
  const tone = healthTone(health.color);
  const pill = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="${tone.bg}" style="background-color:${tone.bg};border-radius:999px;padding:6px 16px 6px 16px;font-family:${FONT};color:${tone.fg};">
<span style="font-size:22px;line-height:30px;font-weight:700;color:${tone.fg};">${health.score}</span><span style="font-size:15px;line-height:30px;font-weight:600;color:${tone.fg};">&nbsp;&middot;&nbsp;${esc(tone.label)}</span>
</td></tr></table>`;
  const reasons =
    health.reasons.length === 0
      ? `<tr><td style="padding:12px 0 0 0;${BASE_TEXT}font-size:14px;line-height:20px;color:${COLOR.muted};">Nothing is pulling the score down this week.</td></tr>`
      : `<tr><td style="padding:14px 0 4px 0;${BASE_TEXT}font-size:13px;line-height:18px;color:${COLOR.muted};">What&#39;s affecting the score</td></tr>` +
        health.reasons
          .slice(0, 3)
          .map(
            (r) =>
              `<tr><td style="padding:3px 0;${BASE_TEXT}font-size:14px;line-height:20px;"><span style="color:${COLOR.primary};font-weight:700;">&bull;</span>&nbsp; ${esc(oneLine(r.message))}</td></tr>`,
          )
          .join("");
  return block(
    `<tr><td style="padding:0;">${pill}</td></tr>` +
      `<tr><td style="padding:6px 0 0 0;${BASE_TEXT}font-size:13px;line-height:18px;color:${COLOR.muted};">Vineyard health score, out of 100</td></tr>` +
      reasons,
  );
}

function statCell(value: number, label: string, emphasis: boolean): string {
  return `<td width="48%" valign="top" bgcolor="${COLOR.tint}" style="width:48%;background-color:${COLOR.tint};border:1px solid ${COLOR.border};border-radius:6px;padding:12px 14px;font-family:${FONT};${WRAP}">
<div style="font-size:28px;line-height:32px;font-weight:700;color:${emphasis ? COLOR.primary : COLOR.ink};">${value}</div>
<div style="font-size:13px;line-height:18px;color:${COLOR.muted};">${esc(label)}</div></td>`;
}

function taskItem(task: DigestTask, asOf: string, kind: "overdue" | "upcoming"): string {
  const accent = kind === "overdue" ? COLOR.primary : COLOR.border;
  const due =
    kind === "overdue"
      ? `<span style="color:${COLOR.primary};font-weight:700;">${esc(dueWording(task, asOf, kind))}</span>`
      : `<span style="color:${COLOR.ink};font-weight:600;">${esc(dueWording(task, asOf, kind))}</span>`;
  const place = task.removedRow
    ? `<span style="color:${COLOR.muted};font-style:italic;">${esc(locationLabel(task))}</span>`
    : `<span style="color:${COLOR.muted};">${esc(locationLabel(task))}</span>`;
  const status = statusLabel(task);
  const statusHtml = status ? ` <span style="color:${COLOR.muted};">&middot; ${esc(status)}</span>` : "";
  return `<tr><td style="padding:8px 0 8px 12px;border-left:3px solid ${accent};${BASE_TEXT}">
<div style="font-size:15px;line-height:21px;font-weight:600;color:${COLOR.ink};${WRAP}">${esc(oneLine(task.title))}</div>
<div style="font-size:13px;line-height:19px;color:${COLOR.muted};${WRAP}">${due} <span style="color:${COLOR.muted};">&middot;</span> ${place}${statusHtml}</div>
</td></tr>${spacer(8)}`;
}

function moreLink(count: number, label: string, url: string): string {
  return `<tr><td style="padding:0 0 4px 15px;${BASE_TEXT}font-size:14px;line-height:20px;"><a href="${esc(url)}" target="_blank" style="color:${COLOR.primary};font-weight:600;text-decoration:underline;">And ${count} more ${esc(label)} in Vineyard Manager</a></td></tr>`;
}

function tasksHtml(data: DigestData, tasksUrl: string): string {
  const { tasks, asOfDate } = data;
  const rangeNote = `${formatCalendarDate(asOfDate)} \u2013 ${formatCalendarDate(addDays(asOfDate, 6))}`;
  const stats = `<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:separate;"><tr>
${statCell(tasks.overdueCount, "Overdue", tasks.overdueCount > 0)}<td width="4%" style="width:4%;font-size:1px;line-height:1px;">&nbsp;</td>${statCell(tasks.upcomingCount, "Due in the next 7 days", false)}
</tr></table></td></tr>`;

  if (tasks.overdueCount === 0 && tasks.upcomingCount === 0) {
    return block(
      stats +
        spacer(12) +
        notice(
          "<strong>You&#39;re all caught up.</strong> Nothing is overdue and nothing is due in the next 7 days.",
        ),
    );
  }

  let rows = stats;
  // Overdue
  if (tasks.overdueCount > 0) {
    const note =
      tasks.overdueCount > tasks.overdue.length
        ? `showing ${tasks.overdue.length} of ${tasks.overdueCount}`
        : undefined;
    rows += subHeading("Overdue", note, 20);
    rows += tasks.overdue.map((t) => taskItem(t, asOfDate, "overdue")).join("");
    if (tasks.overdueCount > tasks.overdue.length) {
      rows += moreLink(tasks.overdueCount - tasks.overdue.length, "overdue tasks", tasksUrl);
    }
  } else {
    rows += subHeading("Overdue", undefined, 20);
    rows += notice("Nothing overdue. Nice work.");
  }
  // Upcoming
  rows += subHeading("Due in the next 7 days", rangeNote, 20);
  if (tasks.upcomingCount > 0) {
    rows += tasks.upcoming.map((t) => taskItem(t, asOfDate, "upcoming")).join("");
    if (tasks.upcomingCount > tasks.upcoming.length) {
      rows += moreLink(tasks.upcomingCount - tasks.upcoming.length, "upcoming tasks", tasksUrl);
    }
  } else {
    rows += notice(
      "<strong>Nothing due in the next 7 days.</strong>",
      "A good week to work through the overdue list above.",
    );
  }
  return block(rows);
}

function alertHtml(alert: DigestAlert, timeZone: string): string {
  const starts = alert.startsAt
    ? `<div style="padding-top:4px;font-size:13px;line-height:18px;color:${COLOR.muted};">Starts ${esc(formatInstant(alert.startsAt, timeZone, false))}</div>`
    : "";
  const description = oneLine(alert.description);
  return `<tr><td bgcolor="${COLOR.tint}" style="background-color:${COLOR.tint};border:1px solid ${COLOR.border};border-left:4px solid ${COLOR.primary};border-radius:4px;padding:12px 14px;${BASE_TEXT}">
<div style="font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${COLOR.primary};">${esc(severityLabel(alert.severity))} &middot; ${esc(hazardLabel(alert.hazard))}</div>
<div style="padding-top:4px;font-size:15px;line-height:21px;font-weight:700;color:${COLOR.ink};${WRAP}">${esc(oneLine(alert.title))}</div>
${description ? `<div style="padding-top:2px;font-size:14px;line-height:20px;color:${COLOR.ink};${WRAP}">${esc(description)}</div>` : ""}
${starts}</td></tr>${spacer(8)}`;
}

function precipText(day: DigestDay): string {
  return day.precipProbabilityPct === null ? "\u2013" : `${Math.round(day.precipProbabilityPct)}%`;
}

function precipAmount(day: DigestDay): string | null {
  if (!(day.precipInches >= 0.01)) return null;
  return `${day.precipInches >= 1 ? day.precipInches.toFixed(1) : day.precipInches.toFixed(2)} in`;
}

function outlookHtml(days: DigestDay[], asOf: string): string {
  const cell = `padding:8px 4px;border-bottom:1px solid ${COLOR.border};font-family:${FONT};font-size:14px;line-height:19px;vertical-align:top;${WRAP}`;
  const head = `padding:0 4px 6px 4px;border-bottom:1px solid ${COLOR.border};font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;color:${COLOR.muted};text-transform:uppercase;letter-spacing:0.04em;`;
  const rows = days
    .map((day) => {
      const isToday = day.date === asOf;
      const weekday = isToday ? "Today" : formatCalendarDate(day.date, { weekday: true }).split(",")[0] ?? "";
      const amount = precipAmount(day);
      return `<tr>
<td style="${cell}color:${COLOR.ink};"><span style="font-weight:700;">${esc(weekday)}</span><br><span style="font-size:13px;color:${COLOR.muted};">${esc(formatCalendarDate(day.date))}</span></td>
<td style="${cell}color:${COLOR.ink};">${esc(oneLine(day.summary))}</td>
<td style="${cell}color:${COLOR.ink};white-space:nowrap;"><span style="font-weight:700;">${Math.round(day.tempMaxF)}&deg;</span><span style="color:${COLOR.muted};"> / ${Math.round(day.tempMinF)}&deg;</span></td>
<td align="right" style="${cell}color:${COLOR.ink};text-align:right;">${esc(precipText(day))}${amount ? `<br><span style="font-size:12px;color:${COLOR.muted};white-space:nowrap;">${esc(amount)}</span>` : ""}</td>
</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;">
<tr><td width="24%" style="width:24%;${head}">Day</td><td width="38%" style="width:38%;${head}">Conditions</td><td width="22%" style="width:22%;${head}">Hi / Lo</td><td width="16%" align="right" style="width:16%;${head}text-align:right;">Rain</td></tr>
${rows}</table>`;
}

function weatherHtml(data: DigestData): string {
  const { weather } = data;
  if (!weather.available) {
    const reason = weather.unavailableReason ? oneLine(weather.unavailableReason) : "";
    return block(
      notice(
        "<strong>Weather isn&#39;t available for this digest.</strong>",
        reason ? `Reason: ${esc(reason)}` : "Check the forecast in Vineyard Manager.",
      ),
    );
  }
  let rows = "";
  if (weather.alerts.length > 0) {
    rows += subHeading(
      weather.alerts.length === 1 ? "Alert" : `Alerts (${weather.alerts.length})`,
      undefined,
      4,
    );
    rows += weather.alerts.map((a) => alertHtml(a, data.vineyard.timeZone)).join("");
  } else {
    rows += `<tr><td style="padding:4px 0 4px 0;${BASE_TEXT}font-size:14px;line-height:20px;color:${COLOR.muted};">No weather alerts for the next 7 days.</td></tr>`;
  }
  rows += subHeading("7-day outlook", undefined, weather.alerts.length > 0 ? 12 : 16);
  rows +=
    weather.outlook.length > 0
      ? `<tr><td style="padding:0;">${outlookHtml(weather.outlook, data.asOfDate)}</td></tr>`
      : notice("No forecast days came back this week.");
  return block(rows);
}

function ctaHtml(appUrl: string, tasksUrl: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;"><tr>
<td align="center" bgcolor="${COLOR.primary}" style="background-color:${COLOR.primary};border-radius:6px;">
<a href="${esc(appUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;border:1px solid ${COLOR.primary};border-radius:6px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:700;color:${COLOR.onPrimary};text-decoration:none;">Open Vineyard Manager</a>
</td></tr></table>
<div style="padding-top:12px;font-family:${FONT};font-size:14px;line-height:20px;text-align:center;"><a href="${esc(tasksUrl)}" target="_blank" style="color:${COLOR.primary};text-decoration:underline;">View all tasks</a></div>`;
}

// ---------------------------------------------------------------- render

export function render(data: DigestData): { subject: string; html: string; text: string } {
  const { tasks, weather, health, vineyard } = data;
  const base = data.appUrl.replace(/\/+$/, "");
  const appUrl = `${base}/`;
  const tasksUrl = `${base}/tasks`;
  const name = oneLine(vineyard.name);
  const tone = healthTone(health.color);
  const weekOf = `Week of ${formatCalendarDate(data.weekStart)}`;
  const generated = formatInstant(data.generatedAt, vineyard.timeZone);
  const subject = buildSubject(data);
  const preheader = buildPreheader(data);
  const reasonWhy = `You're getting this weekly digest because you manage ${name} in Vineyard Manager and weekly digests are on for your account.`;
  const weatherNote =
    "Weather from Open-Meteo. Alerts are derived from the forecast and are not official NWS warnings.";

  // ---------- HTML
  const preheaderPad = "&#847;&zwnj;&nbsp;".repeat(90);
  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<style>${RESPONSIVE_CSS}</style>
</head>
<body bgcolor="${COLOR.page}" style="margin:0;padding:0;width:100%;background-color:${COLOR.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLOR.page};opacity:0;">${esc(preheader)}${preheaderPad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.page}" style="width:100%;background-color:${COLOR.page};">
<tr><td align="center" class="vm-outer" style="padding:24px 8px;">
<table role="presentation" class="vm-card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.card}" style="width:100%;max-width:600px;background-color:${COLOR.card};border:1px solid ${COLOR.border};border-radius:8px;border-collapse:separate;table-layout:fixed;">
<tr><td class="vm-px" bgcolor="${COLOR.primary}" style="background-color:${COLOR.primary};border-radius:7px 7px 0 0;padding:22px 24px 20px 24px;font-family:${FONT};${WRAP}">
<div style="font-size:13px;line-height:18px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${COLOR.onPrimarySoft};">Weekly digest</div>
<div class="vm-h1" style="padding-top:4px;font-size:24px;line-height:30px;font-weight:700;color:${COLOR.onPrimary};${WRAP}">${esc(name)}</div>
<div style="padding-top:4px;font-size:15px;line-height:21px;color:${COLOR.onPrimary};">${esc(weekOf)}</div>
</td></tr>
<tr><td class="vm-px" style="padding:24px 24px 4px 24px;${BASE_TEXT}font-size:18px;line-height:24px;font-weight:700;">Vineyard health</td></tr>
<tr><td class="vm-px" style="padding:8px 24px 24px 24px;">${healthHtml(data)}</td></tr>
${sectionHeading("Tasks")}
<tr><td class="vm-px" style="padding:12px 24px 16px 24px;">${tasksHtml(data, tasksUrl)}</td></tr>
${sectionHeading("Weather")}
<tr><td class="vm-px" style="padding:8px 24px 24px 24px;">${weatherHtml(data)}</td></tr>
<tr><td class="vm-px" align="center" style="padding:24px 24px 28px 24px;border-top:1px solid ${COLOR.border};">${ctaHtml(appUrl, tasksUrl)}</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;">
<tr><td class="vm-px" style="padding:16px 24px 8px 24px;font-family:${FONT};font-size:12px;line-height:18px;color:${COLOR.muted};${WRAP}">
${esc(reasonWhy)}<br>
Generated ${esc(generated)}.<br>
${esc(weatherNote)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  // ---------- Plain text
  const L: string[] = [];
  const blank = () => L.push("");
  const item = (textValue: string) => L.push(...wrap(textValue, 72, "- ", "  "));
  const para = (textValue: string) => L.push(...wrap(textValue, 72));

  L.push(...wrap(name, 72));
  L.push(`Weekly digest ${MIDDOT} ${weekOf}`);
  L.push("=".repeat(Math.min(72, Math.max(name.length, 28))));
  blank();

  L.push(...underline("HEALTH"));
  para(`Score: ${health.score} / 100 ${MIDDOT} ${tone.label}`);
  if (health.reasons.length === 0) {
    para("Nothing is pulling the score down this week.");
  } else {
    para("What's affecting the score:");
    for (const r of health.reasons.slice(0, 3)) item(r.message);
  }
  blank();

  L.push(...underline("TASKS"));
  para(`Overdue: ${tasks.overdueCount} ${MIDDOT} Due in the next 7 days: ${tasks.upcomingCount}`);
  blank();
  const taskLines = (t: DigestTask, kind: "overdue" | "upcoming") => {
    item(t.title);
    const status = statusLabel(t);
    L.push(
      ...wrap(
        [dueWording(t, data.asOfDate, kind), locationLabel(t), status].filter(Boolean).join(` ${MIDDOT} `),
        72,
        "  ",
      ),
    );
  };
  if (tasks.overdueCount === 0 && tasks.upcomingCount === 0) {
    para("You're all caught up. Nothing is overdue and nothing is due in the next 7 days.");
  } else {
    if (tasks.overdueCount > 0) {
      L.push(
        tasks.overdueCount > tasks.overdue.length
          ? `Overdue (showing ${tasks.overdue.length} of ${tasks.overdueCount})`
          : `Overdue (${tasks.overdueCount})`,
      );
      for (const t of tasks.overdue) taskLines(t, "overdue");
      if (tasks.overdueCount > tasks.overdue.length) {
        item(`And ${tasks.overdueCount - tasks.overdue.length} more overdue tasks:`);
        L.push(`  ${tasksUrl}`);
      }
    } else {
      L.push("Overdue");
      para("Nothing overdue. Nice work.");
    }
    blank();
    L.push(
      `Due in the next 7 days (${formatCalendarDate(data.asOfDate)} - ${formatCalendarDate(addDays(data.asOfDate, 6))})`,
    );
    if (tasks.upcomingCount > 0) {
      for (const t of tasks.upcoming) taskLines(t, "upcoming");
      if (tasks.upcomingCount > tasks.upcoming.length) {
        item(`And ${tasks.upcomingCount - tasks.upcoming.length} more upcoming tasks:`);
        L.push(`  ${tasksUrl}`);
      }
    } else {
      para("Nothing due in the next 7 days. A good week to work through the overdue list above.");
    }
  }
  blank();

  L.push(...underline("WEATHER"));
  if (!weather.available) {
    para("Weather isn't available for this digest.");
    if (weather.unavailableReason) para(`Reason: ${weather.unavailableReason}`);
  } else {
    if (weather.alerts.length === 0) {
      para("Alerts: none for the next 7 days.");
    } else {
      L.push(weather.alerts.length === 1 ? "Alert" : `Alerts (${weather.alerts.length})`);
      for (const a of weather.alerts) {
        item(`[${severityLabel(a.severity).toUpperCase()} ${MIDDOT} ${hazardLabel(a.hazard)}] ${a.title}`);
        if (oneLine(a.description)) L.push(...wrap(a.description, 72, "  "));
        if (a.startsAt) L.push(...wrap(`Starts ${formatInstant(a.startsAt, vineyard.timeZone, false)}`, 72, "  "));
      }
    }
    blank();
    L.push("7-day outlook");
    if (weather.outlook.length === 0) para("No forecast days came back this week.");
    for (const d of weather.outlook) {
      const date = formatCalendarDate(d.date, { weekday: true });
      const day = d.date === data.asOfDate ? `Today (${date})` : date;
      const amount = precipAmount(d);
      const rain = `rain ${precipText(d)}${amount ? ` (${amount})` : ""}`;
      item(
        `${day}: ${oneLine(d.summary)} ${MIDDOT} ${Math.round(d.tempMaxF)}${DEG}/${Math.round(d.tempMinF)}${DEG}F ${MIDDOT} ${rain}`,
      );
    }
  }
  blank();

  L.push(...underline("OPEN VINEYARD MANAGER"));
  L.push(`Dashboard: ${appUrl}`);
  L.push(`All tasks: ${tasksUrl}`);
  blank();
  L.push("--");
  para(reasonWhy);
  para(`Generated ${generated}.`);
  para(weatherNote);

  return { subject, html, text: L.join("\n") + "\n" };
}
