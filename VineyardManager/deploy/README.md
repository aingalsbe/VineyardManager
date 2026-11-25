# Vineyard production

Checkout: `/root/vineyard-src` (branch `main`).
App directory: `/root/vineyard-src/VineyardManager`.

## Updates

1. Take a live backup (Postgres dump + uploads):

```sh
cd /root/vineyard-src/VineyardManager
./deploy/scripts/backup-prod.sh
```

2. Pull `main`, rebuild, and restart only the `vineyard` containers:

```sh
cd /root/vineyard-src
git pull --ff-only origin main
cd VineyardManager
docker compose -p vineyard -f deploy/compose.yaml build
docker compose -p vineyard -f deploy/compose.yaml up -d
```

The API container entrypoint runs `prisma migrate deploy` automatically on startup.

3. If `deploy/nginx/abidevine.conf` changed, update only the `abidevine.hipfog.com` blocks in the shared reverse-proxy `default.conf` (leave `hipfog.com` and `upward.hipfog.com` unchanged), then test and reload `hipfog-proxy`:

```sh
docker exec hipfog-proxy nginx -t
docker exec hipfog-proxy nginx -s reload
```

## Secrets & env

Secrets stay in `deploy/env/api.env` and `deploy/env/db.env` on the server (mode 600). They are not committed.

- `JWT_SECRET` must be a strong random string (≥ 32 chars); production startup fails closed otherwise.
- When `MAIL_TRANSPORT=resend`, `RESEND_API_KEY` is required (entrypoint fails closed if missing).
- `WEATHER_CRON_ENABLED` stays `false` until go-live. `DIGEST_CRON_ENABLED` stays `false`.

## One-time owner bootstrap

Create the owner, once, from a terminal on the server:

```sh
cd /root/vineyard-src/VineyardManager
docker compose -p vineyard -f deploy/compose.yaml exec -it vineyard-api node deploy/create-owner.mjs
```

## Shared-VPS guardrails

Do not run `docker compose down` or `docker system prune`. Do not rebuild UpwardScoreboard or LBCSigns.
