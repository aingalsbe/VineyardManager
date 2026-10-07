# Weather v1 — daily rain check (shipped)

**Shipped:** 2026-10-06  
**Repo:** `C:\AIProjects\VineyardManager`

## What shipped

Automated daily rain check keyed off each vineyard’s **stored location** (`lat`/`lng` on the Vineyard row from Setup; geocode `address` and persist coords only when lat/lng are missing).

| Rule | Behavior |
| --- | --- |
| Threshold | ≥ **0.5 inches** rain in the past rolling **24 hours** |
| Source | Open-Meteo hourly precipitation (`precipitation_unit=inch`) |
| On trigger | One **vineyard-scoped** `watering` Activity (`source: "weather"`, method `rainfall`) — not per-row, not a Task |
| Idempotency | One rain-sourced watering per vineyard + local calendar date (`details.checkDate`) |
| Health | Existing `GET .../health` credits watering Activities; no snapshot / recalculate POST |
| UI | **No** Dashboard button. Cron runs inside the API process (kept alive by Start-VineyardManager) |

### Schedule

- Cron: `15 6 * * *` (6:15 AM)
- Timezone: `America/Chicago`
- Env: `WEATHER_CRON_ENABLED` (default `true`; set `false` to disable)
- Wired in `apps/api/src/main.ts` → `startWeatherScheduler()`

### Manual / script endpoint

```http
POST /api/v1/vineyards/{vineyardId}/weather/daily-check
Authorization: Bearer <token>
```

Requires `manager` or `power_user` (`requireOperate`).

Example (PowerShell):

```powershell
$login = Invoke-RestMethod -Method POST -Uri http://localhost:3001/api/v1/auth/login `
  -ContentType application/json `
  -Body '{"email":"owner@vineyard.local","password":"VineyardDev1!"}'
$token = $login.data.token
$vineyards = Invoke-RestMethod -Uri http://localhost:3001/api/v1/vineyards `
  -Headers @{ Authorization = "Bearer $token" }
$vid = $vineyards.data[0].id
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:3001/api/v1/vineyards/$vid/weather/daily-check" `
  -Headers @{ Authorization = "Bearer $token" }
```

Response `data` includes `rainInches`, `triggered`, `activityCreated`, `skippedReason` (`below_threshold` | `already_logged_today` | null), and the Activity when created/found.

## Files

- `packages/shared` — `weather` activity source; `rainfall` watering method; watering details rain fields
- `apps/api/src/modules/weather/` — Open-Meteo client, service, router, scheduler
- `apps/api/src/main.ts`, `config.ts`, `app.ts`

## Left for later (not this slice)

- GET current / 7-day forecast + alerts UI
- Weather notification prefs (severe, drought/overwater, frost/snow)
- Configurable rain threshold in Setup
- Dashboard / Metrics surfacing of weather-sourced watering
- Service-account auth for external schedulers (cron inside API is enough for local)
- Photo underlay (explicitly out of scope)