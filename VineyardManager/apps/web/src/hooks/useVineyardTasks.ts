import type { Row, ScheduledTask, Vineyard } from "@vineyard/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError, listRows, listTasks, listVineyards } from "@/lib/api";

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

export function useVineyardTasks() {
  const [state, setState] = useState<VineyardTasksState>({
    status: "loading",
  });

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setState({ status: "loading" });
    }
    try {
      const vineyards = await listVineyards();
      const vineyard = vineyards[0];
      if (!vineyard) {
        setState({ status: "empty-vineyard" });
        return;
      }
      const [rows, tasks] = await Promise.all([
        listRows(vineyard.id),
        listTasks(vineyard.id),
      ]);
      setState({ status: "ready", vineyard, rows, tasks });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Could not reach the Vineyard Manager API.";
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
