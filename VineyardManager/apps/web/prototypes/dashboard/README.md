# Dashboard UI/UX prototypes — Vineyard Manager

Static HTML alternatives for Aaron’s morning review. **The live app is unchanged** — these files do not edit `DashboardPage.tsx`, `App.tsx`, or any production components.

## Location

```
apps/web/prototypes/dashboard/
  A-ops-command.html
  B-bento-grid.html
  C-calm-overview.html
  README.md
```

## How to open

### Option 1 — file:// (fastest)

In File Explorer open:

`C:\AIProjects\VineyardManager\apps\web\prototypes\dashboard\`

Double-click any `.html` file (Chrome/Edge/Firefox). Tailwind loads from CDN — needs network once.

### Option 2 — simple static serve

From a terminal:

```bat
cd C:\AIProjects\VineyardManager\apps\web\prototypes\dashboard
npx --yes serve .
```

Then open the URL shown (often `http://localhost:3000`) and pick A / B / C.

Or with Python:

```bat
cd C:\AIProjects\VineyardManager\apps\web\prototypes\dashboard
python -m http.server 8765
```

Open `http://localhost:8765/A-ops-command.html` (and B / C).

## What each option emphasizes

### A — Ops Command (`A-ops-command.html`)

- **Decisions above the fold:** weather summary, alerts, and due/overdue tasks before scrolling.
- **Map-first health:** clickable row cells + drill-in panel; **no** duplicate dense per-row scroll list.
- Keeps live **CloudSun pop-down** over health chrome + map (current + 7-day + alerts).

### B — Bento Grid (`B-bento-grid.html`)

- **Asymmetric tiles** for health score, weather entry, alerts, map, tasks, and harvests.
- Weather is still a **labeled CloudSun control** that opens the same overlay pattern—not a large weather card in the scroll stack.
- Good for scanning “homes” for each concern at a glance.

### C — Calm Overview (`C-calm-overview.html`)

- **Spacious hero** for overall health + weather control; quieter typography and padding.
- **Needs attention** list only (problem rows + frost)—healthy rows stay on the glance strip.
- Refined task/harvest lists with less card chrome clutter.

## Design rules reflected here

- Cool blue chrome: primary `#215a96`, page `#eef2f6`, card white, muted `#5a6573`, border `#cfd7e1`, foreground `#122033`.
- Green / yellow / orange / red traffic colors are for **vineyard health only**.
- Weather follows the live pattern: icon in health chrome → pop-down over health + map.

## Fake data

Shared demo vineyard **Hillside Estate**: overall yellow 72, six rows (R01–R06), frost advisory Thursday, sample tasks and harvests. Interactive weather overlay (open/close, Escape) works in all three.

## Out of scope

- No commit/push.
- No edits to live Dashboard or imported production components.
