# Vineyard Manager: Bugs and Known Issues

**Created:** 2026-10-07 (Morgan, from Avery's QA passes)  
**As of commit:** `687ec55` (weekly digest)  
**How to use:** pick items from here into a slice on `VineyardManager-Next-Steps.md`. When something is fixed, move it to "Fixed" with its commit hash.

Severity: **Medium** = should fix before a real-user rollout. **Low** = cosmetic, edge case, or hygiene.

---

## Open

### Config / ops

| # | Sev | Issue | Notes / likely fix |
| --- | --- | --- | --- |
| C1 | Medium | `APP_URL` missing from `apps/api/.env`, so every digest and password-reset link falls back to `http://localhost:5173` (it only works on the laptop). | Set `APP_URL` before turning on `DIGEST_CRON_ENABLED` or inviting real users. `.env.example` and the docs already list it. |
| C2 | Low | SMTP is now live (config.ts loads `.env` first). Password resets for real addresses send real email. `*.local` addresses never get mail. | Intended; noted so nobody is surprised. |
| C3 | Low | Hand-written partial index `digest_logs_scheduled_once` (`WHERE kind='scheduled'`). A future `prisma migrate dev` may generate a `DROP INDEX` for it. | Delete that line from any generated migration. There's a note in `schema.prisma`. |
| C4 | Low | The NAS mirror keeps files deleted from the repo (robocopy `EXTRA`): old `_qa_temp` artifacts (including a token file) and `apps/api/src/modules/auth/mailer.ts`. | Clean the NAS copy by hand, or add `/PURGE` (or `/MIR`) to the script after review. |
| C5 | Low | CRLF line endings in `app.ts`, `main.ts`, `vineyard-health.router.ts`, `.env.example` and several new digest files. | Add `.gitattributes` (`* text=auto eol=lf`) and renormalize once. |
| C6 | Low | Reset links with live tokens are written to the API console for `.local` addresses or when SMTP isn't configured. | Restrict to `NODE_ENV=development` and mask the token. |

### Weekly digest

| # | Sev | Issue | Notes / likely fix |
| --- | --- | --- | --- |
| D1 | Low | When weather is down, the email shows recipients the raw provider error (`digest.template.ts` around lines 347 and 515). | Show "Weather unavailable this week" and log the detail on the server. |
| D2 | Low | Health flags a task due on day 8, but the digest's 7-day list leaves it out, so the two disagree. | Share one due-soon window constant between health and the digest. |
| D3 | Low | A viewer on the read-only preview sees "Your role cannot change this.", which doesn't fit. | Use read-only wording for preview. |
| D4 | Low | No digest on/off toggle in Settings and no preferences link in the email (the `weeklyDigest` pref exists in the API only). | Settings toggle plus a link in the email footer. Sage also suggested a recipient greeting, the source on each alert, and health thresholds. |
| D5 | Low | If the API crashes mid-send, a rare duplicate is possible after the 1-hour retry window. | Acceptable for now. |
| D6 | Low | The 404 for a missing vineyard on send-test is untested, because recipient checks run first. | Add a test. |

### UI

| # | Sev | Issue | Notes / likely fix |
| --- | --- | --- | --- |
| U1 | Low | The Dismissed task badge looks the same as the grey task-type pill; only the small icon tells them apart. | Outline or dashed style for Dismissed. |
| U2 | Low | Map pop-up "Rows not on the map": chips are bars sized by vine count (9px per vine, minimum 56px), so labels get clipped (e.g. "-TEMP-KE" at 390). Low today because every seed row is placed. | Wrapping text chips (color dot plus label) or a capped bar width. |
| U3 | Low | The app's orange `#c46a2f` fails 4.5:1 with both white and dark text. The email uses `#d27838`. | Align the app token. |
| U4 | Low | `PeopleCard` and `RowLayoutEditor` still use `window.confirm`. | Switch to `ConfirmDialog`. |
| U5 | Low | The main JS chunk is about 888 kB (build warning). | Split by route with `React.lazy`. |
| U6 | Low | Health lists a lot of reasons (about 18 at baseline, 7 from removed seed rows); the Dashboard shows only the first. | Group or collapse removed-row reasons. |

### Data / logic

| # | Sev | Issue | Notes / likely fix |
| --- | --- | --- | --- |
| L1 | Low | The Dashboard decides "overdue" by the browser's local midnight, while health and the digest use the vineyard's time zone. Same today (America/Chicago). | Compute overdue in the vineyard's time zone everywhere. |
| L2 | Low | There's no way to undo a row delete (soft-deleted rows can't be restored from the UI). | Add Restore under a "Removed rows" filter. |
| L3 | Low | Harvest and activity cards get "Removed row" only through the `__old_` code fallback (the `deletedAt` field was added later). | Use `row.deletedAt` everywhere now that it's serialized. |

---

## Fixed

| Issue | Commit |
| --- | --- |
| Row/task delete, partial row PATCH, removed-row labels | `9b914db` |
| Open tasks on deleted rows (warn, then Dismiss/Keep), confirm dialog copy, plurals | `39d1485` |
| RowCard sideways scroll at 390px, focus after delete, dialog text wrapping | `995a8a3` |
| Row/task status badges no longer use health colors; Rows delete notice wraps | `687ec55` |