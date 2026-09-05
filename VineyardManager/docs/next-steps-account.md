# Self-serve account + email password reset — Grok Build prompt

**Launch (TUI already open in the project folder):**
`@docs/next_steps_archive/next-steps-account.md Execute this slice. Follow it strictly. Do not expand scope.`

Load this whole file into Grok Build (agent / multi-file).

Do not use `VineyardManager-Next-Steps.md`. Living status lives in `VineyardManager/CONTINUE.md`.

**Last updated:** 2026-09-05
**Repo:** https://github.com/aingalsbe/VineyardManager
**Working tree:** nested at `VineyardManager/`
**Depends on:** Invites slice (`docs/next_steps_archive/next-steps-invites.md`) must already be on disk. Expect `User.disabledAt`, People card on Setup, and `/vineyards/:id/users`. Adapt if field names differ. Do not revert invites, auth, or roles.

Read `VineyardManager/AGENTS.md` first. Small, focused diff. One feature slice only.

==================================================
GOAL
==================================================
Any signed-in user can change their own display name and email from Settings. Anyone (signed in or not) can reset a password with an email link. Power-user people admin from the invites slice stays as-is.

==================================================
CURRENT STATE (after invites)
==================================================
- Users have `email`, `displayName`, `role`, `passwordHash`, `disabledAt`, `deletedAt`.
- `GET /api/v1/auth/me` returns `PublicUser` (`id, email, displayName, role, disabledAt?`).
- No `PATCH /auth/me`. No change-password. No forgot/reset routes.
- Settings (`/settings`) is a read-only card: name, email, role, plus a notifications teaser. Secondary nav already points here.
- Login is email + password only. No “Forgot password?” link.
- No mailer, no `PasswordReset` table, no SMTP env documented.
- Invites still show a one-time temp password. Leave that. Do not switch invites to email in this slice.
- Web does not use TanStack Query. Match existing hooks / `lib/api`.

==================================================
REQUIREMENTS
==================================================

1) Schema

   New model (name your call; `PasswordReset` is fine):

   - `id` UUID
   - `userId` FK → User
   - `tokenHash` string (store a hash, never the raw token)
   - `expiresAt` timestamptz
   - `usedAt` timestamptz?
   - `createdAt`

   Index `userId`. New migration only.

2) Self profile API

   | Method | Path | Auth | Body | Purpose |
   |--------|------|------|------|---------|
   | PATCH | `/api/v1/auth/me` | required | `{ displayName?, email? }` | Update own profile |
   | POST  | `/api/v1/auth/change-password` | required | `{ currentPassword, newPassword }` | Logged-in password change |

   **PATCH /me**
   - Only the signed-in user. Never accepts `role`, `disabledAt`, or `passwordHash`.
   - `displayName`: trim, required if present, 1–80 chars.
   - `email`: trim + lowercase. Must stay unique among non-deleted users. `409 EMAIL_TAKEN` if another live user has it. Disabled users still “own” their email.
   - Deleted / disabled users cannot PATCH (auth already rejects them).
   - Response: `{ data: PublicUser }`. Existing JWT stays valid; client should refresh `/me`.

   **POST /change-password**
   - Verify `currentPassword`. Wrong → `401` / `INVALID_CREDENTIALS`.
   - `newPassword` min 10 characters. Hash with bcryptjs like login does.
   - Optional: revoke nothing (JWT is stateless). Fine.
   - Response: `{ data: { ok: true } }`.

3) Forgot + reset password (email link)

   | Method | Path | Auth | Body |
   |--------|------|------|------|
   | POST | `/api/v1/auth/forgot-password` | public | `{ email }` |
   | POST | `/api/v1/auth/reset-password` | public | `{ token, newPassword }` |

   **Forgot**
   - Always return `{ data: { ok: true } }` with the same message whether the email exists or not. Do not leak accounts.
   - If a live, enabled user matches:
     - Create a reset row. Raw token = crypto random URL-safe string. Store only a hash.
     - Expires in **1 hour**. Previous unused tokens for that user: mark used or delete so only the latest works.
     - Send email if SMTP is configured (see mailer below).
     - **Development only** (`NODE_ENV !== "production"`): also include `data.devResetUrl` so Aaron can click it without a mailbox. Never include this key in production.
   - Disabled or deleted users: still return generic ok. Do not send mail.

   **Reset**
   - Lookup by token hash. Missing / expired / used → `400 RESET_INVALID`.
   - `newPassword` min 10. Hash, save, set `usedAt`, clear `disabledAt` only if you have a product reason — **do not** re-enable a disabled account via reset. Disabled stays disabled.
   - Response `{ data: { ok: true } }`. User then logs in on `/login`.

4) Mailer

   Small helper in the API, not a new product.

   - If `SMTP_URL` (or `SMTP_HOST` + `SMTP_PORT` + `SMTP_USER` + `SMTP_PASS`) is set, send with nodemailer (or the existing HTTP stack if a mailer already exists — do not add two).
   - From: `MAIL_FROM` or `Vineyard Manager <noreply@localhost>`.
   - Subject: `Reset your Vineyard Manager password`
   - Body: short plaintext + the link `{APP_URL}/reset-password?token={rawToken}`. `APP_URL` defaults to `http://localhost:5173`.
   - If SMTP is **not** set: log the reset URL at info level and rely on `devResetUrl` in development. Do not fail the request.
   - No HTML marketing template. No third-party paid email API. No API keys committed.

5) Web UI

   **Settings (`/settings`)** — every signed-in role:
   - Edit display name + email, Save → PATCH `/auth/me`. Reload current user so the sidebar name updates.
   - Change password form: current + new + confirm → POST `/change-password`.
   - Role stays read-only text. Notifications teaser can stay as copy.
   - Do not put People admin here. That stays on Setup.

   **Login**
   - Add “Forgot password?” → `/forgot-password`.

   **Forgot page** (`/forgot-password`)
   - Email field. Submit → POST forgot. Always show “If that account exists, we sent a reset link.”
   - In development, if `devResetUrl` comes back, show a clearly labeled local-only link so Aaron can finish the flow without SMTP.

   **Reset page** (`/reset-password?token=`)
   - New password + confirm. Submit → POST reset. On success, send them to `/login` with a short “password updated” note.
   - Bad/expired token: explain and link back to forgot.

   Reuse existing form / button / card styles. Cool blue UI. No new design system.

6) Docs in the repo

   Update `VineyardManager/CONTINUE.md`:
   - Last completed: Settings edits name + email; logged-in change-password; forgot/reset via email link (`devResetUrl` when SMTP is off).
   - Next priority: weather v1 (`docs/next_steps_archive/next-steps-weather.md`) unless Aaron says otherwise. No photo underlay.

   Note env vars in CONTINUE.md: `SMTP_URL` / `MAIL_FROM` / `APP_URL`, and that local reset works without mail.

==================================================
OUT OF SCOPE
==================================================
- Invite-by-email (invites keep the copy-once temp password)
- Public register / marketing signup
- Email verification for a changed address
- 2FA, refresh tokens, session list
- Re-enabling a disabled user via reset
- Notification prefs editor
- Weather, underlay, second vineyard, Nest rewrite, TanStack Query
- Changing seed passwords

==================================================
DONE WHEN
==================================================
- `owner@` can change display name on Settings; sidebar updates
- Changing email to one that is free succeeds; taking `manager@vineyard.local` returns a conflict
- Logged-in change-password works; old password then fails on login
- Forgot password for `owner@vineyard.local` returns ok; in dev the page (or response) yields a link; opening it sets a new password; old password fails
- Forgot password for a nonsense email still returns ok and sends nothing
- Disabled user cannot reset their way back in
- Manager and viewer can edit their own name/email, still cannot open People admin
- People card from the invites slice still works
- CONTINUE.md updated
