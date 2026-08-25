import type { Vineyard, VineyardHealth } from "@vineyard/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getVineyardHealth, listVineyards } from "@/lib/api";

export type VineyardHealthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty-vineyard" }
  | { status: "ready"; vineyard: Vineyard; health: VineyardHealth };

export function useVineyardHealth() {
  const [state, setState] = useState<VineyardHealthState>({
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
      const health = await getVineyardHealth(vineyard.id);
      setState({ status: "ready", vineyard, health });
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
