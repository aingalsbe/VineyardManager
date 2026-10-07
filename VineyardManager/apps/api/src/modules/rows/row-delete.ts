import type { Prisma, Row } from "@prisma/client";
import {
  OPEN_TASK_STATUSES,
  calendarDateInZone,
  type RowDeleteCounts,
  type RowDeleteOpenTask,
} from "@vineyard/shared";

/**
 * Single source of truth for row delete: mode, counts, open tasks, message.
 * Used by GET /rows/:id/delete-preview and DELETE /rows/:id so they can't drift.
 *
 * - Any task / harvest / activity referencing the row (including soft-deleted
 *   ones) is history → SOFT delete. No references at all → HARD delete.
 * - "Open" tasks = live (deletedAt null) tasks with status pending | sent.
 */
export type RowDeletePlan = {
  mode: "soft" | "hard";
  counts: RowDeleteCounts;
  openTasks: RowDeleteOpenTask[];
  message: string;
};

type Db = Prisma.TransactionClient;

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export function rowDeleteMessage(
  code: string,
  mode: "soft" | "hard",
  counts: RowDeleteCounts,
): string {
  if (mode === "hard") {
    return `Row ${code} deleted.`;
  }
  return (
    `Row ${code} removed. Its history (` +
    `${plural(counts.tasks, "task")}, ` +
    `${plural(counts.harvests, "harvest")}, ` +
    `${plural(counts.activities, "activity", "activities")}` +
    `) is kept and will show as "Removed row".`
  );
}

export const openTaskWhere = (rowId: string): Prisma.TaskWhereInput => ({
  rowId,
  deletedAt: null,
  status: { in: [...OPEN_TASK_STATUSES] },
});

export async function planRowDelete(
  db: Db,
  row: Pick<Row, "id" | "code">,
  timeZone: string,
): Promise<RowDeletePlan> {
  const [tasks, harvests, activities, open] = await Promise.all([
    db.task.count({ where: { rowId: row.id } }),
    db.harvest.count({ where: { rowId: row.id } }),
    db.activity.count({ where: { rowId: row.id } }),
    db.task.findMany({
      where: openTaskWhere(row.id),
      select: { id: true, title: true, dueAt: true, status: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const counts: RowDeleteCounts = {
    tasks,
    openTasks: open.length,
    harvests,
    activities,
  };
  const mode = tasks + harvests + activities === 0 ? "hard" : "soft";

  return {
    mode,
    counts,
    openTasks: open.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: calendarDateInZone(task.dueAt, timeZone),
      status: task.status,
    })),
    message: rowDeleteMessage(row.code, mode, counts),
  };
}
