# Resume Vineyard Manager (Grok Build)

**Launch (TUI already open in the project folder):**
`@docs/RESUME.md Pick up here. Read VineyardManager/CONTINUE.md and AGENTS.md. Confirm HEAD. Do not revert shipped work. Execute the next slice only after Aaron’s launch line — do not start coding from this file alone.`

Stopped 2026-09-05 afternoon.

## Where we left off
- `origin/main` last seen: `5bb8b69` Update for user and role management and permissions
- Roles live: `power_user` / `manager` / `viewer`. Writes already 403 for viewers.
- Demo: `owner@vineyard.local` / `manager@vineyard.local` / `viewer@vineyard.local` — password `VineyardDev1!`
- Seed vineyard: **Abide in the Vine Vineyard**
- Metrics, NS/EW codes, blue UI, act-from-map, layout, logo all live
- Invites are outlined, not shipped. No `disabledAt`. No People card. No forgot-password.

## Do not
- Revert Auth, roles, Metrics, layout, health, act-from-map
- Build a photo underlay
- Start a second vineyard
- Add SMTP or password-reset email inside the **invites** slice
- Switch invites to a VineyardMember join table
- Expand either slice past its prompt

## Next slices (Aaron already picked this order)

1. **Invites + people admin** (this session unless he says otherwise)
   `@docs/next_steps_archive/next-steps-invites.md Execute this slice. Follow it strictly. Do not expand scope.`

2. **Self-serve account + email password reset** (after invites ships)
   `@docs/next_steps_archive/next-steps-account.md Execute this slice. Follow it strictly. Do not expand scope.`

Weather v1 stays queued at `docs/next_steps_archive/next-steps-weather.md` until both user slices are done.

## After a slice ships
Update `VineyardManager/CONTINUE.md`. Do not start the next file until Aaron pastes its launch line.
