# Vineyard production

Checkout: `/root/vineyard-src` (branch `vineyard-abidevine-packaging`).
App directory: `/root/vineyard-src/VineyardManager`.

Updates:

```sh
cd /root/vineyard-src
git pull
cd VineyardManager
docker compose -p vineyard -f deploy/compose.yaml build
docker compose -p vineyard -f deploy/compose.yaml up -d
```

Secrets stay in `deploy/env/api.env` and `deploy/env/db.env` on the server (mode 600). They are not committed. Type the SMTP password and the owner password on the server.

Create the owner, once, from a terminal on the server:

```sh
cd /root/vineyard-src/VineyardManager
docker compose -p vineyard -f deploy/compose.yaml exec -it vineyard-api node deploy/create-owner.mjs
```

`WEATHER_CRON_ENABLED` stays `false` until go-live. `DIGEST_CRON_ENABLED` stays `false`.

Do not run `docker compose down` or `docker system prune`. Do not rebuild UpwardScoreboard.
