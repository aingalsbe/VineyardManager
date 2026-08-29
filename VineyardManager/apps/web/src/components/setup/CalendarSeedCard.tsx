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
}: {
  vineyardId: string;
  address: string;
  timezone: string;
  readOnly?: boolean;
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
        err instanceof ApiError ? err.message : "Could not seed the calendar",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="text-sm font-medium text-primary">Calendar</p>
      <CardTitle className="mt-1">This year’s work calendar</CardTitle>
      <CardDescription>
        Seeds a typical Midwest grape year (prune, feed, pest, weed, water,
        harvest, winterize). Weather lookup comes later. Address is already on
        the vineyard form.
      </CardDescription>
      <p className="mt-3 text-sm text-muted">
        {address} · {timezone}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || readOnly}
          onClick={() => void onSeed()}
        >
          {busy ? "Seeding…" : "Seed this year’s calendar"}
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
