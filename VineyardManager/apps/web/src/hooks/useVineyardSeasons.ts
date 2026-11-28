import type { SeasonDto } from "@vineyard/shared";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "@/components/layout/AppLayout";
import { listSeasons } from "@/lib/api";

export function useVineyardSeasons() {
  const { vineyard } = useOutletContext<AppOutletContext>();
  const [seasons, setSeasons] = useState<SeasonDto[]>([]);

  useEffect(() => {
    if (!vineyard) {
      setSeasons([]);
      return;
    }
    const controller = new AbortController();
    listSeasons(vineyard.id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSeasons(data);
      })
      .catch(() => {
        // Fallback silently; list filters still work with "current" and "all".
      });
    return () => controller.abort();
  }, [vineyard]);

  return seasons;
}
