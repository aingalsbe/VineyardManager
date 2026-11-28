import { Link } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ApiError, seedVineyardCalendar } from "@/lib/api";

export function CalendarSeedCard({
  vineyardId,
  address,
  timezone,
  readOnly = false,
  dormant = false,
}: {
  vineyardId: string;
  address: string;
  timezone: string;
  readOnly?: boolean;
  dormant?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(
    null,
  );

  async function onSeed() {
    setBusy(true);
    setError(null);
    try {
      const next = await seedVineyardCalendar(vineyardId);
      setResult(next);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not add calendar tasks",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="text-sm font-medium text-primary">Calendar</p>
      <CardTitle className="mt-1">Add missing calendar tasks to this season</CardTitle>
      <CardDescription>
        Adds any standard vineyard work tasks (prune, feed, pest, weed, water,
        harvest, winterize) not already present in the active season, dated in
        the vineyard’s time zone.
      </CardDescription>
      <p className="mt-3 text-sm text-muted">
        {address} · {timezone}
      </p>
      {readOnly ? (
        <p id="calendar-seed-reason" className="mt-2 text-sm text-muted">
          Only a power user can add calendar tasks.
        </p>
      ) : dormant ? (
        <p id="calendar-seed-reason" className="mt-2 text-sm text-muted">
          Start the next season first, then add calendar tasks.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || readOnly || dormant}
          aria-describedby={readOnly || dormant ? "calendar-seed-reason" : undefined}
          onClick={() => void onSeed()}
        >
          {busy ? "Adding…" : "Add missing calendar tasks"}
        </Button>
        <Button asChild variant="outline">
          <Link to="/tasks">Open tasks</Link>
        </Button>
      </div>
      {result ? (
        <p className="mt-3 text-sm text-muted">
          Added {result.created}
          {result.skipped > 0 ? `, skipped ${result.skipped} already present` : ""}.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm font-medium text-health-red" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
