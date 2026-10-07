import { Link } from "react-router-dom";
import { Droplets, Gauge, Wind } from "lucide-react";
import type { VineyardWeatherState } from "@/hooks/useVineyardWeather";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { WeatherAlerts } from "@/components/weather/WeatherAlerts";
import { WeatherDayStrip } from "@/components/weather/WeatherDayStrip";
import {
  formatMph,
  formatObservedAt,
  formatPct,
  formatPrecipInches,
  formatTemp,
} from "@/components/weather/formatWeather";
import { weatherIconForCode } from "@/components/weather/weatherIcons";

export function WeatherCard({
  state,
  onRetry,
}: {
  state: VineyardWeatherState;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <div className="space-y-2" aria-busy="true">
        <Card className="min-h-40 animate-pulse bg-card/70" />
        <p className="sr-only">Loading weather</p>
      </div>
    );
  }

  if (state.status === "empty-vineyard") {
    return null;
  }

  if (state.status === "location-unresolved") {
    return (
      <EmptyState
        title="Set location in Setup"
        action={
          <Button asChild>
            <Link to="/setup">Open Setup</Link>
          </Button>
        }
      >
        {state.message ||
          "Add an address (or coordinates) for the vineyard so weather can load."}
      </EmptyState>
    );
  }

  if (state.status === "weather-unavailable") {
    return (
      <EmptyState
        title="Weather unavailable"
        action={
          <Button type="button" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {state.message || "The weather service did not respond. Try again shortly."}
      </EmptyState>
    );
  }

  if (state.status === "error") {
    return (
      <EmptyState
        title="Could not load weather"
        action={
          <Button type="button" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {state.message}
      </EmptyState>
    );
  }

  const { weather } = state;
  const { current } = weather;
  const CurrentIcon = weatherIconForCode(current.weatherCode);

  return (
    <Card>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Weather</CardTitle>
          <CardDescription>
            Updated {formatObservedAt(current.observedAt, weather.timeZone)}
            {weather.cached ? " · cached" : ""}
          </CardDescription>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <CurrentIcon
            className="mt-1 size-10 shrink-0 text-primary"
            aria-hidden
          />
          <div>
            <p className="text-4xl font-semibold tracking-tight text-foreground">
              {formatTemp(current.tempF)}
              <span className="ml-1 text-lg font-medium text-muted">F</span>
            </p>
            <p className="mt-0.5 text-base font-medium text-foreground">
              {current.summary}
            </p>
            {current.feelsLikeF != null ? (
              <p className="mt-0.5 text-sm text-muted">
                Feels like {formatTemp(current.feelsLikeF)}F
              </p>
            ) : null}
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <li className="flex items-center gap-2 text-muted">
            <Droplets className="size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-medium text-foreground">
                {formatPrecipInches(current.precipInches)}
              </span>{" "}
              precip
            </span>
          </li>
          <li className="flex items-center gap-2 text-muted">
            <Gauge className="size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-medium text-foreground">
                {formatPct(current.humidityPct)}
              </span>{" "}
              humidity
            </span>
          </li>
          <li className="flex items-center gap-2 text-muted">
            <Wind className="size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-medium text-foreground">
                {formatMph(current.windMph)}
              </span>
              {current.windGustMph != null
                ? ` (gust ${formatMph(current.windGustMph)})`
                : ""}{" "}
              wind
            </span>
          </li>
        </ul>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-muted">7-day forecast</h3>
        <WeatherDayStrip days={weather.daily} timeZone={weather.timeZone} />
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-muted">Alerts</h3>
        <WeatherAlerts alerts={weather.alerts} timeZone={weather.timeZone} />
      </div>
    </Card>
  );
}
