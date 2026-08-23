import type { Activity, Row } from "@vineyard/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError, listActivities, listRows, listVineyards } from "@/lib/api";

export type ActivitiesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty-vineyard" }
  | {
      status: "ready";
      vineyardId: string;
      rows: Row[];
      activities: Activity[];
    };

export function useActivities() {
  const [state, setState] = useState<ActivitiesState>({ status: "loading" });

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
      const [rows, activities] = await Promise.all([
        listRows(vineyard.id),
        listActivities(vineyard.id),
      ]);
      setState({
        status: "ready",
        vineyardId: vineyard.id,
        rows,
        activities,
      });
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
