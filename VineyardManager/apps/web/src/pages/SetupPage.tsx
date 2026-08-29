import { useOutletContext } from "react-router-dom";
import { formatRowLength, type Vineyard } from "@vineyard/shared";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { CalendarSeedCard } from "@/components/setup/CalendarSeedCard";
import { HealthThresholdsCard } from "@/components/setup/HealthThresholdsCard";
import { VarietyCatalogCard } from "@/components/setup/VarietyCatalogCard";
import { VineyardForm } from "@/components/setup/VineyardForm";
import { RowLayoutEditor } from "@/components/setup/RowLayoutEditor";
import { StatCard } from "@/components/StatCard";
import type { AppOutletContext } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useVineyardHealth } from "@/hooks/useVineyardHealth";
import { useVineyardRows } from "@/hooks/useVineyardRows";
import { summarizeRows } from "@/lib/summarize-rows";

export function SetupPage() {
  const { canSetup } = useRoleAccess();
  const { vineyard, reloadVineyard } = useOutletContext<AppOutletContext>();
  const { state, reload } = useVineyardRows();
  const health = useVineyardHealth();
  const stats =
    state.status === "ready" ? summarizeRows(state.rows) : null;
  const current: Vineyard | null =
    state.status === "ready" ? state.vineyard : vineyard;

  async function onVineyardSaved() {
    await reloadVineyard();
    await reload({ silent: true });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Setup"
        description="Vineyard identity, rows on the pad, grape names, this year’s calendar, and health cutoffs."
      />
      {canSetup ? null : (
        <p className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-muted">
          Only a power user can change vineyard setup.
        </p>
      )}

      {state.status === "loading" ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3" aria-busy="true">
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <Card className="min-h-24 animate-pulse bg-card/70" />
          <p className="sr-only">Loading vineyard stats</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="mb-6">
          <EmptyState
            title="Could not load vineyard stats"
            action={
              <Button type="button" onClick={() => void reload()}>
                Try again
              </Button>
            }
          >
            {state.message}
          </EmptyState>
        </div>
      ) : null}

      <div className="mb-6">
        {state.status === "loading" && !current ? (
          <Card className="min-h-40 animate-pulse bg-card/70" />
        ) : (
          <VineyardForm
            vineyard={current}
            readOnly={!canSetup}
            onSaved={onVineyardSaved}
          />
        )}
      </div>

      {stats ? (
        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Active rows"
            value={String(stats.active)}
            hint={
              stats.total === stats.active
                ? `${stats.total} rows on the property`
                : `${stats.total} rows total`
            }
          />
          <StatCard
            label="Total length"
            value={formatRowLength(stats.lengthFeet, stats.lengthInches)}
            hint={`Across ${stats.total} ${stats.total === 1 ? "row" : "rows"}`}
          />
          <StatCard
            label="Vines"
            value={String(stats.vines)}
            hint="Sum of vine counts on every row"
          />
        </section>
      ) : null}

      {state.status === "ready" && current ? (
        <section className="mb-6">
          <Card>
            <p className="text-sm font-medium text-primary">Step 2</p>
            <CardTitle className="mt-1">Map rows</CardTitle>
            <CardDescription>
              Drag bars to match the property. Length comes from vine count.
              Save when the pad looks right.
            </CardDescription>
            {state.rows.length === 0 ? (
              <p className="mt-4 text-muted">
                Add rows first, then place them here.
              </p>
            ) : (
              <div className="mt-4">
                <RowLayoutEditor
                  vineyardId={current.id}
                  rows={state.rows}
                  readOnly={!canSetup}
                  savedLayout={current.rowLayout}
                  healthByRowId={
                    new Map(
                      health.state.status === "ready"
                        ? health.state.health.rows.map((row) => [row.rowId, row])
                        : [],
                    )
                  }
                  onSaved={onVineyardSaved}
                />
              </div>
            )}
          </Card>
        </section>
      ) : null}

      {current ? (
        <div className="grid gap-4 md:grid-cols-2">
          <VarietyCatalogCard
            vineyardId={current.id}
            readOnly={!canSetup}
            catalog={current.varietyCatalog}
            usedOnRows={
              state.status === "ready"
                ? state.rows.map((row) => row.variety)
                : []
            }
            onSaved={onVineyardSaved}
          />
          <CalendarSeedCard
            vineyardId={current.id}
            address={current.address}
            timezone={current.timezone}
            readOnly={!canSetup}
          />
          <div className="md:col-span-2">
            <HealthThresholdsCard
              vineyardId={current.id}
              readOnly={!canSetup}
              greenMin={current.healthThresholds.greenMin}
              yellowMin={current.healthThresholds.yellowMin}
              orangeMin={current.healthThresholds.orangeMin}
              onSaved={async () => {
                await onVineyardSaved();
                await health.reload({ silent: true });
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
