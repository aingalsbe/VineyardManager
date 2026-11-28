import { PrismaClient } from "@prisma/client";
import { ANNUAL_CALENDAR_TEMPLATES } from "@vineyard/shared";
import { pathToFileURL } from "node:url";

export type Backfill26Table = "tasks" | "harvests" | "activities" | "rows";
export type Backfill26Reason =
  | "untagged_report"
  | "set_template_key"
  | "duplicate_title"
  | "set_pre_delete_code";

export type Backfill26Line = {
  vineyardOrdinal: number;
  table: Backfill26Table;
  reason: Backfill26Reason;
  count: number;
};

export type Backfill26Args = {
  apply: boolean;
  databaseUrlEnv: string | null;
};

const TEMPLATE_KEY_BY_TITLE = new Map<string, string>(
  ANNUAL_CALENDAR_TEMPLATES.map((t) => [t.title, t.templateKey]),
);

const SAFE_EXACT_MESSAGES = new Set([
  "--apply requires --database-url-env <NAME>",
  "--database-url-env requires <NAME>",
  "Unknown argument",
  "Backfill failed",
]);

const SAFE_TABLES = new Set(["tasks", "harvests", "activities", "rows"]);

export function parseBackfill26Args(argv: readonly string[]): Backfill26Args {
  let apply = false;
  let databaseUrlEnv: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--dry-run") {
      apply = false;
    } else if (arg === "--database-url-env") {
      const next = argv[i + 1];
      if (!next || !/^[A-Z0-9_]+$/i.test(next)) {
        throw new Error("--database-url-env requires <NAME>");
      }
      databaseUrlEnv = next;
      i += 1;
    } else {
      throw new Error("Unknown argument");
    }
  }

  if (apply && !databaseUrlEnv) {
    throw new Error("--apply requires --database-url-env <NAME>");
  }

  return { apply, databaseUrlEnv };
}

export function databaseUrlFromEnv(envName: string): string {
  const value = process.env[envName];
  if (!value || !value.trim()) {
    throw new Error(`Environment variable ${envName} is not set`);
  }
  return value.trim();
}

export function formatBackfill26Line(line: Backfill26Line): string {
  return `vineyard=${line.vineyardOrdinal} table=${line.table} reason=${line.reason} count=${line.count}`;
}

export function sanitizeBackfill26Error(error: unknown): string {
  if (
    error instanceof Error &&
    (SAFE_EXACT_MESSAGES.has(error.message) ||
      /^Environment variable [A-Z0-9_]+ is not set$/.test(error.message))
  ) {
    return error.message;
  }
  const record =
    typeof error === "object" && error !== null && !Array.isArray(error)
      ? (error as Record<string, unknown>)
      : null;
  const rawCode = record?.code;
  const code =
    typeof rawCode === "string" &&
    (/^P\d{4}$/.test(rawCode) ||
      rawCode === "40001" ||
      rawCode === "23505" ||
      rawCode === "23503" ||
      rawCode === "40P01")
      ? rawCode
      : "backfill_failed";
  const parts = [`code=${code}`];
  const table = record?.table;
  if (typeof table === "string" && SAFE_TABLES.has(table)) {
    parts.push(`table=${table}`);
  }
  return parts.join(" ");
}

export function extractPreDeleteCode(rowId: string, code: string): string | null {
  const suffix = `__old_${rowId.slice(0, 8)}`;
  if (!code.toLowerCase().endsWith(suffix.toLowerCase())) {
    return null;
  }
  const stripped = code.slice(0, -suffix.length).trim();
  return stripped.length > 0 ? stripped : null;
}

/**
 * Run idempotent Seasons 2-6 backfill (§5.2) across all live vineyards.
 * - Dry-run by default: reports exact planned counts without mutating data.
 * - Apply: inside one transaction per vineyard:
 *   1. Reports untagged tasks/harvests/activities (seasonId IS NULL) — report only.
 *   2. Sets templateKey on live tasks in active/planned seasons where templateKey IS NULL
 *      and title matches a fixed-calendar template; skips duplicates (reason=duplicate_title).
 *   3. Sets preDeleteCode on soft-deleted rows where preDeleteCode IS NULL and code ends
 *      in __old_<id8> (preDeleteStatus stays null -> restore defaults to active).
 *   4. Never modifies closed/legacy seasons, season statuses, task statuses, or deletes.
 */
export async function runBackfill26WithClient(
  prisma: PrismaClient,
  mode: "dry-run" | "apply",
): Promise<Backfill26Line[]> {
  const vineyards = await prisma.vineyard.findMany({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const allLines: Backfill26Line[] = [];

  for (let idx = 0; idx < vineyards.length; idx += 1) {
    const vineyardId = vineyards[idx]!.id;
    const ordinal = idx + 1;

    const vineyardLines = await prisma.$transaction(async (tx) => {
      const lines: Backfill26Line[] = [];

      // 1. Untagged records (report only)
      const [untaggedTasks, untaggedHarvests, untaggedActivities] =
        await Promise.all([
          tx.task.count({ where: { vineyardId, seasonId: null } }),
          tx.harvest.count({ where: { vineyardId, seasonId: null } }),
          tx.activity.count({ where: { vineyardId, seasonId: null } }),
        ]);

      if (untaggedTasks > 0) {
        lines.push({
          vineyardOrdinal: ordinal,
          table: "tasks",
          reason: "untagged_report",
          count: untaggedTasks,
        });
      }
      if (untaggedHarvests > 0) {
        lines.push({
          vineyardOrdinal: ordinal,
          table: "harvests",
          reason: "untagged_report",
          count: untaggedHarvests,
        });
      }
      if (untaggedActivities > 0) {
        lines.push({
          vineyardOrdinal: ordinal,
          table: "activities",
          reason: "untagged_report",
          count: untaggedActivities,
        });
      }

      // 2. Template keys for live tasks in active or planned seasons only
      const openSeasons = await tx.season.findMany({
        where: { vineyardId, status: { in: ["active", "planned"] } },
        select: { id: true },
      });
      const openSeasonIds = openSeasons.map((s) => s.id);

      let templateKeysToSet = 0;
      let duplicateTitles = 0;

      if (openSeasonIds.length > 0) {
        const liveTasks = await tx.task.findMany({
          where: {
            vineyardId,
            seasonId: { in: openSeasonIds },
            deletedAt: null,
          },
          select: { id: true, seasonId: true, title: true, templateKey: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });

        const usedKeysBySeason = new Map<string, Set<string>>();
        for (const task of liveTasks) {
          if (!task.seasonId || !task.templateKey) continue;
          const set = usedKeysBySeason.get(task.seasonId) ?? new Set<string>();
          set.add(task.templateKey);
          usedKeysBySeason.set(task.seasonId, set);
        }

        for (const task of liveTasks) {
          if (!task.seasonId || task.templateKey !== null) continue;
          const matchedKey = TEMPLATE_KEY_BY_TITLE.get(task.title);
          if (!matchedKey) continue;

          const used = usedKeysBySeason.get(task.seasonId) ?? new Set<string>();
          if (used.has(matchedKey)) {
            duplicateTitles += 1;
            continue;
          }

          used.add(matchedKey);
          usedKeysBySeason.set(task.seasonId, used);
          templateKeysToSet += 1;

          if (mode === "apply") {
            await tx.task.update({
              where: { id: task.id },
              data: { templateKey: matchedKey },
            });
          }
        }
      }

      if (templateKeysToSet > 0) {
        lines.push({
          vineyardOrdinal: ordinal,
          table: "tasks",
          reason: "set_template_key",
          count: templateKeysToSet,
        });
      }
      if (duplicateTitles > 0) {
        lines.push({
          vineyardOrdinal: ordinal,
          table: "tasks",
          reason: "duplicate_title",
          count: duplicateTitles,
        });
      }

      // 3. Soft-deleted rows with preDeleteCode IS NULL and code ending in __old_<id8>
      const deletedRows = await tx.row.findMany({
        where: {
          vineyardId,
          deletedAt: { not: null },
          preDeleteCode: null,
        },
        select: { id: true, code: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      let preDeleteCodesToSet = 0;
      for (const row of deletedRows) {
        const extracted = extractPreDeleteCode(row.id, row.code);
        if (!extracted) continue;
        preDeleteCodesToSet += 1;
        if (mode === "apply") {
          await tx.row.update({
            where: { id: row.id },
            data: { preDeleteCode: extracted },
          });
        }
      }

      if (preDeleteCodesToSet > 0) {
        lines.push({
          vineyardOrdinal: ordinal,
          table: "rows",
          reason: "set_pre_delete_code",
          count: preDeleteCodesToSet,
        });
      }

      return lines;
    });

    allLines.push(...vineyardLines);
  }

  return allLines;
}

export async function runBackfill26(options: {
  databaseUrl: string;
  mode: "dry-run" | "apply";
}): Promise<Backfill26Line[]> {
  const prisma = new PrismaClient({
    datasources: { db: { url: options.databaseUrl } },
  });
  try {
    return await runBackfill26WithClient(prisma, options.mode);
  } finally {
    await prisma.$disconnect();
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = parseBackfill26Args(process.argv.slice(2));
  const envName = args.databaseUrlEnv ?? "DATABASE_URL";
  const databaseUrl = databaseUrlFromEnv(envName);
  const lines = await runBackfill26({
    databaseUrl,
    mode: args.apply ? "apply" : "dry-run",
  });
  for (const line of lines) {
    process.stdout.write(`${formatBackfill26Line(line)}\n`);
  }
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    process.stderr.write(`${sanitizeBackfill26Error(error)}\n`);
    process.exitCode = 1;
  });
}
