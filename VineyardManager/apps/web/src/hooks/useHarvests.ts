import type { Harvest, Row } from "@vineyard/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError, listHarvests, listRows, listVineyards } from "@/lib/api";

export type HarvestsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty-vineyard" }
  | { status: "ready"; rows: Row[]; harvests: Harvest[] };

export function useHarvests() {
  const [state, setState] = useState<HarvestsState>({ status: "loading" });

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
      const [rows, harvests] = await Promise.all([
        listRows(vineyard.id),
        listHarvests(),
      ]);
      setState({ status: "ready", rows, harvests });
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
