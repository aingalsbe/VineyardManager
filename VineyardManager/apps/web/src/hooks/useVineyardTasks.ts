import type { Row, ScheduledTask, Vineyard } from "@vineyard/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "@/components/layout/AppLayout";
import { ApiError, listRows, listTasks } from "@/lib/api";

export type VineyardTasksState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty-vineyard" }
  | {
      status: "ready";
      vineyard: Vineyard;
      rows: Row[];
      tasks: ScheduledTask[];
    };

export function useVineyardTasks(hookOptions?: {
  skipRows?: boolean;
  deleted?: "only";
  seasonId?: string;
}) {
  const skipRows = hookOptions?.skipRows ?? false;
  const deleted = hookOptions?.deleted;
  const seasonId = hookOptions?.seasonId;
  const { vineyard, vineyardStatus, vineyardError, reloadVineyard } =
    useOutletContext<AppOutletContext>();
  const [state, setState] = useState<VineyardTasksState>({
    status: "loading",
  });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (vineyardStatus === "loading") {
        if (!options?.silent) setState({ status: "loading" });
        return;
      }
      if (vineyardStatus === "empty" || !vineyard) {
        if (vineyardStatus === "error") {
          setState({
            status: "error",
            message: vineyardError ?? "Could not reach the Vineyard Manager API.",
          });
          return;
        }
        setState({ status: "empty-vineyard" });
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!options?.silent) {
        setState({ status: "loading" });
      }
      try {
        const [rows, tasks] = await Promise.all([
          skipRows ? Promise.resolve([] as Row[]) : listRows(vineyard.id, controller.signal),
          listTasks(vineyard.id, controller.signal, {
            ...(deleted ? { deleted } : {}),
            ...(seasonId ? { seasonId } : {}),
          }),
        ]);
        if (controller.signal.aborted) return;
        setState({ status: "ready", vineyard, rows, tasks });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof ApiError
            ? error.message
            : "Could not reach the Vineyard Manager API.";
        setState({ status: "error", message });
      }
    },
    [vineyard, vineyardStatus, vineyardError, skipRows, deleted, seasonId],
  );

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const reload = useCallback(
    async (options?: { silent?: boolean }) => {
      if (vineyardStatus === "error") {
        await reloadVineyard();
        return;
      }
      await load(options);
    },
    [vineyardStatus, reloadVineyard, load],
  );

  return { state, reload };
}
