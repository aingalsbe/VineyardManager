import type { Vineyard, VineyardWeather } from "@vineyard/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "@/components/layout/AppLayout";
import { ApiError, getVineyardWeather } from "@/lib/api";

export type VineyardWeatherState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty-vineyard" }
  | { status: "location-unresolved"; message: string }
  | { status: "weather-unavailable"; message: string }
  | { status: "ready"; vineyard: Vineyard; weather: VineyardWeather };

export function useVineyardWeather() {
  const { vineyard, vineyardStatus, vineyardError, reloadVineyard } =
    useOutletContext<AppOutletContext>();
  const [state, setState] = useState<VineyardWeatherState>({
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
        const weather = await getVineyardWeather(vineyard.id, controller.signal);
        if (controller.signal.aborted) return;
        setState({ status: "ready", vineyard, weather });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError) {
          if (error.code === "LOCATION_UNRESOLVED") {
            setState({
              status: "location-unresolved",
              message: error.message,
            });
            return;
          }
          if (error.code === "WEATHER_UNAVAILABLE") {
            setState({
              status: "weather-unavailable",
              message: error.message,
            });
            return;
          }
          setState({ status: "error", message: error.message });
          return;
        }
        setState({
          status: "weather-unavailable",
          message: "Could not reach the weather service.",
        });
      }
    },
    [vineyard, vineyardStatus, vineyardError],
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
