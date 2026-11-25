# Changelog

All notable changes to Vineyard Manager are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-11-25

Security hardening, application efficiency improvements, infrastructure updates, and aligned backlog fixes ([PR #1](https://github.com/aingalsbe/VineyardManager/pull/1)).

### Security
- **HttpOnly session cookies & instant revocation:** Migrated web authentication from `localStorage` JWTs to an `HttpOnly`, `SameSite=Lax`, `Secure` (production) `vm_session` cookie (`Path=/api`) while preserving `Authorization: Bearer` fallback for API/CLI clients. Pinned JWT signing/verification to `HS256` and added `User.tokenVersion` (`token_version`), incremented on logout, password change/reset, role change, disable, delete, and restore.
- **CSRF, HTTP headers, rate limiting & startup guards:** Added `helmet`, `cookie-parser`, `express-rate-limit` (login, forgot-password, reset-password, and API baseline), `trust proxy`, `256kb` JSON body limit, `Origin`/`Referer` + `X-Requested-With: fetch` CSRF checks on cookie-authenticated mutations, and a production startup guard requiring a strong `JWT_SECRET` (≥ 32 chars).
- **Auth & validation hardening:** Equalized unknown-email login timing with a dummy bcrypt compare; made password-reset token consumption atomic inside a transaction with active-user validation and daily expired-token pruning; required `currentPassword` when changing email in Settings; enforced PNG/JPEG/WebP magic-byte verification and `nosniff` + `CSP: default-src 'none'` headers on logo uploads/downloads; tightened shared Zod schemas (password max 72 chars, IANA timezone validation, array/numeric DB bounds, 8 KB activity `details` cap); added same-vineyard validation on harvest row reassignment; sandboxed digest preview CSP; sanitized 500 error and digest failure logs; gated weather `forceRainInches` override to non-production (`Queued #4`).
- **Patched runtime dependency CVEs:** Updated `express`, `multer`, `nodemailer`, and added a `body-parser` override, reducing `pnpm audit --prod` advisories from 22 (1 critical, 7 high, 14 moderate) to 3 high (0 critical, 0 moderate).

### Performance & Efficiency
- **Route-level code splitting (`Bug U5`):** Lazy-loaded route pages with `React.lazy()` + `<Suspense>`, cutting the initial JS bundle from ~888 kB to 349.7 kB (107 kB gzip) and splitting `MetricsPage` (`recharts`, 412.6 kB) into a separate chunk.
- **Frontend fetch deduplication & cancellation:** Shared `vineyard` via `AppOutletContext` (`6× GET /vineyards → 1×`, `3× GET /rows → 1×` on Dashboard), switched logos to direct cookie-authenticated image URLs, and added `AbortController` cancellation across data hooks.
- **Scoring, database & external API efficiency:** Cached `Intl.DateTimeFormat` instances and pre-bucketed open tasks/activities in shared health & metrics scoring; narrowed Prisma `select`s and bounded health/metrics lookback windows; added additive partial live-record indexes (`20261125160000_security_and_perf_indexes`); added optional `?limit=&offset=` pagination on list endpoints; added 8s timeouts, single-flight deduplication, and vineyard-location invalidation to Open-Meteo weather fetches; parallelized weekly digest data assembly; added graceful `SIGTERM`/`SIGINT` shutdown.

### Fixed
- **Digest weather fallback (`Bug D1`):** Replaced raw provider error strings in digest emails with friendly copy and added `rel="noopener noreferrer"` to external links.
- **Resend entrypoint alignment:** Updated `deploy/scripts/api-entrypoint.sh`, `deploy/env/api.env.template`, and `apps/api/.env.example` so `MAIL_TRANSPORT=resend` fails closed when `RESEND_API_KEY` is missing.

### Infrastructure & Developer Experience
- Optimized `deploy/Dockerfile` layer caching and introduced a slim production-only API runtime stage.
- Hardened `deploy/nginx/abidevine.conf` and `deploy/nginx/web-static.conf` (HTTP/2, gzip, HSTS, CSP, security headers, proxy timeouts, and static asset cache headers).
- Added live Postgres + uploads backup script `deploy/scripts/backup-prod.sh`.
- Added GitHub Actions CI workflow (`.github/workflows/ci.yml`) covering typecheck, API tests, build, and advisory prod audit.

## [1.0.0] — 2026-11-11

Initial production deployment to `https://abidevine.hipfog.com/`.

- Vineyard setup, row mapping, health overlay, tasks, activities, harvests, metrics, weather, weekly growing-season digest, user management, seasons Step 1 (model, routing, backfill), Resend HTTPS mail transport, and Docker Compose production packaging.
