# Invites + power-user people admin — Grok Build prompt

**Launch (TUI already open in the project folder):**
`@docs/next_steps_archive/next-steps-invites.md Execute this slice. Follow it strictly. Do not expand scope.`

Load this whole file into Grok Build (agent / multi-file).

Do not use `VineyardManager-Next-Steps.md`. Living status lives in `VineyardManager/CONTINUE.md`.

**Last updated:** 2026-09-05
**Repo:** https://github.com/aingalsbe/VineyardManager
**Working tree:** nested at `VineyardManager/`
**Depends on:** Auth + role checks (`5bb8b69`). Roles already exist: `power_user`, `manager`, `viewer`. `requireSetup` = power user only. `requireOperate` = manager | power user. Do not revert those slices.

Read `VineyardManager/AGENTS.md` first. Small, focused diff. One feature slice only.

==================================================
GOAL
==================================================
`owner@vineyard.local` (and any other `power_user`) can invite people onto Abide in the Vine Vineyard, change their role, and disable their account — from Setup. Managers and viewers cannot.

No outbound email in this slice. The next slice (`next-steps-account.md`) adds self-serve profile + email password reset.

==================================================
CURRENT STATE
==================================================
- Prisma `User`: `id`, `email` (unique), `passwordHash`, `displayName`, `role` (`UserRole`: `power_user` | `manager` | `viewer`), `notificationPrefs`, timestamps, `deletedAt`. **No `disabledAt`. No membership / VineyardUser table.**
- `Vineyard.ownerId` points at the creating power user. Seed owner is `owner@vineyard.local` / Aaron Ingalsbe / `power_user`.
- Seed also has `manager@vineyard.local` (Maya Chen, manager) and `viewer@vineyard.local` (Sam Rivera, viewer). Same password `VineyardDev1!`.
- Access today: `GET /vineyards` returns every non-deleted vineyard. There is one vineyard. Role on `User` is what `canOperateVineyard` / `canSetupVineyard` in `packages/shared/src/roles.ts` consult. Keep that.
- Auth: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`. No register. JWT Bearer. Login does not check a disabled flag (there isn’t one).
- `requireSetup` already gates vineyard create/PATCH/logo. Reuse it for people admin. Do not invent a fourth role.
- Setup page (`/setup`) is power-user territory and has no People card.
- Settings (`/settings`) is a read-only stub (name, email, role blurb). Leave it alone in this slice.
- `PublicUser` is `{ id, email, displayName, role }`.
- Web does not use TanStack Query. Match existing hooks / `lib/api` helpers.
- No photo underlay. No second vineyard. No SMTP.

==================================================
REQUIREMENTS
==================================================

1) Schema

   Add to `User`:
   - `disabledAt DateTime?` (`disabled_at`, timestamptz)

   Do **not** add a `VineyardMember` / join table in this slice. One vineyard, role lives on `User`, URL is still nested under the vineyard so it matches the API outline.

   New Prisma migration. Do not rewrite an old migration.

   Extend `PublicUser` (and any Zod user schema in `packages/shared`) with `disabledAt: string | null`. Never return `passwordHash`.

2) Login + auth must honor disabled / deleted

   - Soft-deleted (`deletedAt`) or disabled (`disabledAt`) users cannot log in. Same generic `401 UNAUTHORIZED` message as a bad password so you do not leak account state. Optional distinct `403 ACCOUNT_DISABLED` is allowed only if the email+password were otherwise valid — pick one and use it consistently.
   - `requireAuth` must reject disabled / deleted users even if a token was issued before the disable. 401.
   - Existing sessions: fine to wait until the next authenticated request.

3) People API (power user only)

   New module `apps/api/src/modules/users/` (router + service). Mount under vineyards.

   All four routes: `requireAuth` + `requireSetup` + vineyard exists.

   | Method | Path | Purpose |
   |--------|------|---------|
   | GET    | `/api/v1/vineyards/:id/users` | List people |
   | POST   | `/api/v1/vineyards/:id/users` | Invite |
   | PATCH  | `/api/v1/vineyards/:id/users/:userId` | Role and/or disable/enable |
   | DELETE | `/api/v1/vineyards/:id/users/:userId` | Soft-delete (remove access) |

   **GET list**
   - Default: users with `deletedAt == null`, including disabled.
   - `?includeDeleted=1` optional; skip if it adds much UI.
   - Sort: role (power_user, manager, viewer), then displayName.
   - Shape: `{ data: PublicUser[] }` matching existing API envelope.

   **POST invite**
   - Body: `{ email, displayName, role }`
   - `role` must be one of `power_user` | `manager` | `viewer`. Default in the UI is `manager`.
   - Normalize email (trim, lowercase).
   - If a **live** user already has that email → `409 CONFLICT` (`USER_EXISTS`). Do not silently reset their password.
   - If a **soft-deleted** user has that email → restore (`deletedAt` null, `disabledAt` null), set displayName + role, issue a new temp password. Same response shape as a fresh invite.
   - Create the user with bcrypt hash of a generated temp password (crypto random, ≥ 12 chars, mix of classes). Do not use `VineyardDev1!` for new people.
   - Response **once**: `{ data: { user: PublicUser, temporaryPassword: string } }`. Never persist the plaintext. Never echo it on GET/PATCH.
   - No email send. No invite-token table in this slice.

   **PATCH**
   - Body may include `role`, `disabled` (boolean), `displayName`.
   - `disabled: true` sets `disabledAt = now()`. `disabled: false` clears it.
   - Changing role does not change password.
   - Guards (all 403 or 409 with a clear code/message):
     - Cannot disable or soft-delete **yourself**.
     - Cannot change **your own** role (prevents accidental lockout). Use a different power user.
     - Cannot disable, demote, or delete the vineyard `ownerId` user.
     - Cannot disable/demote/delete the **last remaining enabled power_user**.
   - Response: `{ data: PublicUser }` (no password).

   **DELETE**
   - Soft-delete: set `deletedAt` and `disabledAt` if not already. User disappears from the default list and cannot log in.
   - Same guards as PATCH.
   - Response: `{ data: { ok: true } }`.

4) Seed

   Do not invent new seed people. The three demo users stay as they are, all enabled.
   Re-seed must stay idempotent on email.

5) Setup UI — People card (power user only)

   Add a card on `/setup`, visible only when `useRoleAccess().canSetup`.
   Managers / viewers who hit Setup already see the read-only message — they must not see invite controls.

   Card contents:
   - Table: display name, email, role, status (`Active` / `Disabled`), vineyard owner badge if `user.id === vineyard.ownerId`
   - **Invite person** button → dialog: email, display name, role select. On success, show the temporary password with a Copy button and a “they sign in at /login” note. Closing the dialog loses the password (by design).
   - Row actions for people who are not you and not the owner:
     - Change role (select + save)
     - Disable / Enable
     - Remove (confirm). Remove = DELETE.
   - Owner row: visible, no disable/remove/role control (or controls disabled with a short reason).
   - Your own row: visible, no self-role / self-disable / self-remove.

   Reuse existing dialog / button / card components. Cool blue UI. Do not add a new top-level nav item. Do not put this on Dashboard.

6) Docs in the repo

   Update `VineyardManager/CONTINUE.md`:
   - Last completed: power users invite / change role / disable people from Setup (`GET/POST/PATCH/DELETE /vineyards/:id/users`). Temp password shown once. No email yet.
   - Next priority: self-serve account — name, email, password reset email link (`docs/next_steps_archive/next-steps-account.md`). No photo underlay.

   If `VineyardManager/docs/api-outline.md` still says “Invites are not shipped,” mark them shipped.

==================================================
OUT OF SCOPE
==================================================
- SMTP / invite emails / “forgot password” / reset tokens
- Users editing their own name, email, or password (that is the next slice)
- Public `/auth/register`
- VineyardMember join table, second vineyard, transferring ownership
- Photo underlay, weather, health formula, TanStack Query, Nest rewrite
- Notification prefs editor
- Changing `owner@vineyard.local` seed password or deleting demo users

==================================================
DONE WHEN
==================================================
- Logged in as `owner@vineyard.local`, Setup shows Aaron / Maya / Sam with correct roles
- Owner can invite e.g. `pat@example.com` as manager, copy a temp password, and that person can log in
- Owner can change Maya from manager → viewer; her writes then 403
- Owner can disable Sam; Sam’s next login fails; enabling Sam restores login
- Owner cannot disable or demote themselves or the vineyard owner
- `manager@` and `viewer@` get 403 on POST/PATCH/DELETE `/vineyards/:id/users` and see no People admin controls
- Existing demo logins still work
- CONTINUE.md updated
