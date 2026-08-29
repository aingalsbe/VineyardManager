import type { MetricsPeriod, Vineyard, VineyardMetrics } from "@vineyard/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getVineyardMetrics, listVineyards } from "@/lib/api";

export type VineyardMetricsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty-vineyard" }
  | { status: "ready"; vineyard: Vineyard; metrics: VineyardMetrics };

export function useVineyardMetrics(period: MetricsPeriod) {
  const [state, setState] = useState<VineyardMetricsState>({
    status: "loading",
  });

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
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
        const metrics = await getVineyardMetrics(vineyard.id, period);
        setState({ status: "ready", vineyard, metrics });
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : "Could not reach the Vineyard Manager API.";
        setState({ status: "error", message });
      }
    },
    [period],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
