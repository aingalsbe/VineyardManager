import type { HealthColor } from "@vineyard/shared";
import { useEffect, useState } from "react";
import { useCurrentSeason } from "@/hooks/useCurrentSeason";
import { getSeasonDetail } from "@/lib/api";

export type DormantHealth = {
  dormant: boolean;
  /** Frozen health from the last close, when a summary exists. */
  closedAt: { color: HealthColor; score: number } | null;
};

/**
 * Dormant state for read surfaces (Sage P2 #10): whether the vineyard is
 * dormant and the frozen "health at close" of the last closed season.
 */
export function useDormantHealth(): DormantHealth {
  const { state } = useCurrentSeason();
  const current = state.status === "ready" ? state.current : null;
  const vineyardId = state.status === "ready" ? state.vineyard.id : null;
  const lastClosedId =
    current?.dormant && current.lastClosedSeason?.hasSummary
      ? current.lastClosedSeason.id
      : null;
  const [closedAt, setClosedAt] = useState<DormantHealth["closedAt"]>(null);

  useEffect(() => {
    if (!vineyardId || !lastClosedId) {
      setClosedAt(null);
      return;
    }
    const controller = new AbortController();
    getSeasonDetail(vineyardId, lastClosedId, controller.signal)
      .then((season) => {
        if (controller.signal.aborted) return;
        const health = season.summary?.health;
        setClosedAt(health ? { color: health.color, score: health.score } : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setClosedAt(null);
      });
    return () => controller.abort();
  }, [vineyardId, lastClosedId]);

  return { dormant: Boolean(current?.dormant), closedAt };
}
