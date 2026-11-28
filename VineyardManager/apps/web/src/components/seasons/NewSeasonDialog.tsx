import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CALENDAR_STAGES,
  CALENDAR_STAGE_LABELS,
  VARIETY_HARVEST_TIMINGS,
  VARIETY_HARVEST_TIMING_LABELS,
  type CalendarStage,
  type NewSeasonPreview,
  type NewSeasonResult,
  type NewSeasonSuggestedTask,
  type VarietyHarvestTags,
  type VarietyHarvestTiming,
} from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModalFocus } from "@/hooks/useModalFocus";
import {
  ApiError,
  createNewSeason,
  getNewSeasonPreview,
} from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { startSeasonLabel } from "@/lib/seasonCopy";

export function NewSeasonDialog({
  vineyardId,
  open,
  onClose,
  onCreated,
}: {
  vineyardId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (result: NewSeasonResult) => Promise<void> | void;
}) {
  const titleId = useId();
  const [preview, setPreview] = useState<NewSeasonPreview | null>(null);
  const [tasks, setTasks] = useState<NewSeasonSuggestedTask[]>([]);
  const [confirmedTags, setConfirmedTags] = useState<VarietyHarvestTags>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setSubmitError(null);
    getNewSeasonPreview(vineyardId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setPreview(data);
        setTasks(data.tasks);
        const initialTags: VarietyHarvestTags = {};
        for (const v of data.varieties) {
          if (v.currentTag) initialTags[v.name] = v.currentTag;
        }
        setConfirmedTags(initialTags);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Could not load the new season preview.",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [open, vineyardId]);

  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, open, { onEscape: onClose, busy: submitting });

  const grouped = useMemo(() => {
    const byStage = new Map<CalendarStage, NewSeasonSuggestedTask[]>();
    for (const stage of CALENDAR_STAGES) {
      byStage.set(stage, []);
    }
    for (const task of tasks) {
      const bucket = byStage.get(task.stage) ?? [];
      bucket.push(task);
      byStage.set(task.stage, bucket);
    }
    return CALENDAR_STAGES.map((stage) => ({
      stage,
      label: CALENDAR_STAGE_LABELS[stage],
      items: byStage.get(stage) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [tasks]);

  const checkedCount = useMemo(
    () => tasks.filter((t) => t.checked).length,
    [tasks],
  );

  if (!open) return null;

  const toggleTask = (templateKey: string, checked: boolean) => {
    setTasks((current) =>
      current.map((t) =>
        t.templateKey === templateKey ? { ...t, checked } : t,
      ),
    );
  };

  const setTaskDate = (templateKey: string, dueDate: string) => {
    setTasks((current) =>
      current.map((t) =>
        t.templateKey === templateKey ? { ...t, dueDate } : t,
      ),
    );
  };

  const setVarietyTag = (name: string, timing: VarietyHarvestTiming | "") => {
    setConfirmedTags((current) => {
      const next = { ...current };
      if (!timing) delete next[name];
      else next[name] = timing;
      return next;
    });
  };

  async function handleCreate() {
    if (!preview) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createNewSeason(vineyardId, {
        year: preview.year,
        tasks: tasks.map((t) => ({
          templateKey: t.templateKey,
          dueDate: t.dueDate,
          checked: t.checked,
          title: t.title,
          body: t.body,
          relatedActivityType: t.relatedActivityType,
        })),
        ...(Object.keys(confirmedTags).length > 0
          ? { varietyHarvestTags: confirmedTags }
          : {}),
      });
      setSubmitting(false);
      await onCreated(result);
    } catch (err) {
      setSubmitting(false);
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "Could not start the new season.",
      );
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[90dvh] outline-none w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-xl font-semibold tracking-tight">
            {startSeasonLabel(preview?.year)}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Review the suggested work calendar, uncheck tasks you don't need,
            and adjust due dates before starting.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted" aria-busy="true">
              Preparing season calendar preview…
            </p>
          ) : loadError ? (
            <p className="text-sm text-health-red" role="alert">
              {loadError}
            </p>
          ) : preview ? (
            <>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-medium text-foreground">
                  {preview.calendarSource === "location"
                    ? "Location-based calendar"
                    : "Fixed calendar fallback"}
                </p>
                <p className="mt-0.5 text-muted">{preview.calendarNote}</p>
                {preview.climateSummary ? (
                  <p className="mt-1 text-xs text-muted">
                    Based on {preview.climateSummary.yearsAnalyzed} years of
                    weather history
                    {preview.climateSummary.avgLastSpringFrost
                      ? ` · Avg last spring frost: ${formatShortDate(preview.climateSummary.avgLastSpringFrost)}`
                      : ""}
                    {preview.climateSummary.avgFirstFallFrost
                      ? ` · Avg first fall frost: ${formatShortDate(preview.climateSummary.avgFirstFallFrost)}`
                      : ""}
                  </p>
                ) : null}
                {preview.plannedSeasonId ? (
                  <p className="mt-1 text-xs font-medium text-primary">
                    Existing planned records for {preview.year} will be kept
                    when this season activates.
                  </p>
                ) : null}
              </div>

              {preview.varieties.length > 0 ? (
                <section className="rounded-lg border border-border bg-background/40 p-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Variety harvest timing (optional confirmation)
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Suggestions are never saved until you confirm or choose a
                    timing.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {preview.varieties.map((v) => {
                      const currentValue = confirmedTags[v.name] ?? "";
                      return (
                        <li
                          key={v.name}
                          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        >
                          <div className="min-w-0 text-sm">
                            <span className="font-medium">{v.name}</span>
                            {v.suggestedTag && !currentValue ? (
                              <span className="ml-2 text-xs text-muted">
                                Suggested:{" "}
                                {VARIETY_HARVEST_TIMING_LABELS[v.suggestedTag]}
                                {v.suggestionSource
                                  ? ` (${v.suggestionSource})`
                                  : ""}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-nowrap items-center gap-2">
                            {v.suggestedTag &&
                            currentValue !== v.suggestedTag ? (
                              <Button
                                type="button"
                                size="smTouch"
                                variant="outline"
                                onClick={() =>
                                  setVarietyTag(v.name, v.suggestedTag!)
                                }
                              >
                                Use{" "}
                                {VARIETY_HARVEST_TIMING_LABELS[v.suggestedTag]}
                              </Button>
                            ) : null}
                            <select
                              aria-label={`Harvest timing for ${v.name}`}
                              className="h-11 rounded-md border border-border bg-card px-2 text-sm sm:h-9 disabled:cursor-not-allowed disabled:opacity-60"
                              value={currentValue}
                              onChange={(event) =>
                                setVarietyTag(
                                  v.name,
                                  event.target.value as
                                    | VarietyHarvestTiming
                                    | "",
                                )
                              }
                            >
                              <option value="">Timing unset</option>
                              {VARIETY_HARVEST_TIMINGS.map((timing) => (
                                <option key={timing} value={timing}>
                                  {VARIETY_HARVEST_TIMING_LABELS[timing]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {grouped.map((group) => (
                <section key={group.stage} className="space-y-2">
                  <h3 className="text-sm font-semibold text-primary">
                    {group.label}
                  </h3>
                  <ul className="space-y-2">
                    {group.items.map((task) => (
                      <li
                        key={task.templateKey}
                        className="rounded-lg border border-border bg-background/50 p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={task.checked}
                              disabled={submitting}
                              onChange={(event) =>
                                toggleTask(
                                  task.templateKey,
                                  event.target.checked,
                                )
                              }
                              className="mt-1 size-4 shrink-0 accent-primary"
                            />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {task.title}
                                </span>
                                {task.isEstimate ? (
                                  <Badge variant="muted">Estimate</Badge>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted">
                                {task.body}
                              </span>
                            </span>
                          </label>
                          <div className="shrink-0 sm:w-40">
                            <Input
                              type="date"
                              aria-label={`Due date for ${task.title}`}
                              value={task.dueDate}
                              disabled={!task.checked || submitting}
                              onChange={(event) =>
                                setTaskDate(
                                  task.templateKey,
                                  event.target.value,
                                )
                              }
                            />
                          </div>
                        </div>
                        <details className="mt-2 pl-6.5 text-xs text-muted">
                          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary sm:min-h-0">
                            Why this date?
                          </summary>
                          <p className="mt-1">{task.source}</p>
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          ) : null}

          {submitError ? (
            <p className="text-sm font-medium text-health-red" role="alert">
              {submitError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-background/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            {preview
              ? `${checkedCount} of ${tasks.length} tasks selected`
              : ""}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={loading || !preview || submitting}
              onClick={() => void handleCreate()}
            >
              {submitting ? "Starting…" : startSeasonLabel(preview?.year)}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
