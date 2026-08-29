import { HEALTH_SCORE_DEFAULTS, healthThresholdsSchema } from "@vineyard/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, updateVineyard } from "@/lib/api";
import { healthSwatch } from "@/lib/health";

export function HealthThresholdsCard({
  vineyardId,
  greenMin,
  yellowMin,
  orangeMin,
  onSaved,
  readOnly = false,
}: {
  vineyardId: string;
  greenMin: number;
  yellowMin: number;
  orangeMin: number;
  onSaved: () => Promise<void> | void;
  readOnly?: boolean;
}) {
  const [green, setGreen] = useState(String(greenMin));
  const [yellow, setYellow] = useState(String(yellowMin));
  const [orange, setOrange] = useState(String(orangeMin));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGreen(String(greenMin));
    setYellow(String(yellowMin));
    setOrange(String(orangeMin));
  }, [greenMin, yellowMin, orangeMin]);

  async function save(next: {
    greenMin: number;
    yellowMin: number;
    orangeMin: number;
  }) {
    setSaving(true);
    setError(null);
    const parsed = healthThresholdsSchema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join("; "));
      setSaving(false);
      return;
    }
    try {
      await updateVineyard(vineyardId, { healthThresholds: parsed.data });
      await onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save health colors",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    await save({
      greenMin: Number(green),
      yellowMin: Number(yellow),
      orangeMin: Number(orange),
    });
  }

  const g = Number(green);
  const y = Number(yellow);
  const o = Number(orange);

  return (
    <Card>
      <p className="text-sm font-medium text-primary">Health colors</p>
      <CardTitle className="mt-1">Score cutoffs</CardTitle>
      <CardDescription>
        Inclusive floors. Dashboard uses these the next time health loads.
      </CardDescription>
      <form className="mt-4 space-y-3" onSubmit={(event) => void onSubmit(event)}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="th-green">Green at or above</Label>
            <Input
              id="th-green"
              inputMode="numeric"
              value={green}
              onChange={(event) => setGreen(event.target.value)}
              disabled={saving || readOnly}
            />
          </div>
          <div>
            <Label htmlFor="th-yellow">Yellow at or above</Label>
            <Input
              id="th-yellow"
              inputMode="numeric"
              value={yellow}
              onChange={(event) => setYellow(event.target.value)}
              disabled={saving || readOnly}
            />
          </div>
          <div>
            <Label htmlFor="th-orange">Orange at or above</Label>
            <Input
              id="th-orange"
              inputMode="numeric"
              value={orange}
              onChange={(event) => setOrange(event.target.value)}
              disabled={saving || readOnly}
            />
          </div>
        </div>
        <ul className="space-y-1 text-sm text-muted">
          <li className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${healthSwatch.green}`} />
            Green {Number.isFinite(g) ? `${g}–100` : "—"}
          </li>
          <li className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${healthSwatch.yellow}`} />
            Yellow{" "}
            {Number.isFinite(y) && Number.isFinite(g) ? `${y}–${g - 1}` : "—"}
          </li>
          <li className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${healthSwatch.orange}`} />
            Orange{" "}
            {Number.isFinite(o) && Number.isFinite(y) ? `${o}–${y - 1}` : "—"}
          </li>
          <li className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${healthSwatch.red}`} />
            Red {Number.isFinite(o) ? `below ${o}` : "—"}
          </li>
        </ul>
        {error ? (
          <p className="text-sm font-medium text-health-red" role="alert">
            {error}
          </p>
        ) : null}
        {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save cutoffs"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => void save({ ...HEALTH_SCORE_DEFAULTS })}
          >
            Reset defaults
          </Button>
        </div>
        )}
      </form>
    </Card>
  );
}
