import { HEALTH_COLORS, HEALTH_SCORE_DEFAULTS } from "@vineyard/shared";
import { useEffect, useState } from "react";

type ApiHealth = {
  status: string;
  service: string;
  timestamp: string;
};

const colorSwatch: Record<(typeof HEALTH_COLORS)[number], string> = {
  green: "bg-health-green",
  yellow: "bg-health-yellow",
  orange: "bg-health-orange",
  red: "bg-health-red",
};

export default function App() {
  const [api, setApi] = useState<ApiHealth | "loading" | "offline">("loading");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/v1/health")
      .then(async (response) => {
        if (!response.ok) throw new Error("unhealthy");
        return (await response.json()) as ApiHealth;
      })
      .then((data) => {
        if (!cancelled) setApi(data);
      })
      .catch(() => {
        if (!cancelled) setApi("offline");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">
          Vineyard Manager
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Map the rows. Log the work. See what needs attention.
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Scaffold is in place for the web app, API, and shared vineyard model.
          Next slices add login, row setup, and field activity logging.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          API status
        </h2>
        <p className="mt-2 text-muted">
          {api === "loading" && "Checking /api/v1/health…"}
          {api === "offline" &&
            "API is not reachable. Start it with pnpm dev from the repo root."}
          {api !== "loading" &&
            api !== "offline" &&
            `${api.service} is ${api.status} at ${api.timestamp}`}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Health overlay defaults
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {HEALTH_COLORS.map((color) => (
            <li
              key={color}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <span
                className={`size-3.5 rounded-full ${colorSwatch[color]}`}
                aria-hidden
              />
              <span className="capitalize">{color}</span>
              <span className="ml-auto text-sm text-muted">
                {color === "green" && `${HEALTH_SCORE_DEFAULTS.greenMin}–100`}
                {color === "yellow" &&
                  `${HEALTH_SCORE_DEFAULTS.yellowMin}–${HEALTH_SCORE_DEFAULTS.greenMin - 1}`}
                {color === "orange" &&
                  `${HEALTH_SCORE_DEFAULTS.orangeMin}–${HEALTH_SCORE_DEFAULTS.yellowMin - 1}`}
                {color === "red" && `< ${HEALTH_SCORE_DEFAULTS.orangeMin}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
