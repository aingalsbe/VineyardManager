import type { Vineyard, VineyardWeather } from "@vineyard/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getVineyardWeather, listVineyards } from "@/lib/api";

export type VineyardWeatherState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty-vineyard" }
  | { status: "location-unresolved"; message: string }
  | { status: "weather-unavailable"; message: string }
  | { status: "ready"; vineyard: Vineyard; weather: VineyardWeather };

export function useVineyardWeather() {
  const [state, setState] = useState<VineyardWeatherState>({
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
      const weather = await getVineyardWeather(vineyard.id);
      setState({ status: "ready", vineyard, weather });
    } catch (error) {
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
