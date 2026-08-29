# NS/EW row codes in seed + layout — Grok Build prompt

**Launch (TUI already open in the project folder):**
`@docs/next-steps-row-codes.md Execute this slice. Follow it strictly. Do not expand scope.`

Load this whole file into Grok Build (agent / multi-file).

Do not use `VineyardManager-Next-Steps.md`. Living status lives in `VineyardManager/CONTINUE.md`.

**Last updated:** 2026-08-28  
**Repo:** https://github.com/aingalsbe/VineyardManager  
**Working tree:** nested at `VineyardManager/`  
**origin/main last seen:** `1871831` field-accurate rows + act-from-map  

A live-DB rename script already exists at `docs/scripts/Rename-VineyardRows.sql` (L1→NS1, S1→EW1, …). Honor that mapping. Do not invent different codes.

Read `VineyardManager/AGENTS.md` first. Small, focused diff. One feature slice only.

==================================================
GOAL
==================================================
Seed, default layout keys, and any leftover L1/S1 string lookups use:

| old | new code | new name |
|-----|----------|----------|
| L1–L4 | NS1–NS4 | North South 1–4 |
| S1–S11 | EW1–EW11 | East West 1–11 |

Re-seeding an already-renamed database must **update those rows**, not insert a second L1/S1 set.

==================================================
CURRENT STATE
==================================================
- 4 N–S rows, 23 vines / 161', rotation 90
- 11 E–W rows, 10 vines / 70', rotation 0
- Seed file still creates `L1`…`L4`, `S1`…`S11` with old names (North Slope, Creek Bench, …)
- `packages/shared/src/layout.ts` `DEFAULT_ROW_GRID_LAYOUT` and `DEFAULT_ROW_PLACEMENT` keyed by L1/S1
- `layoutFromDefaultGrid` looks up `row.code`
- Saved `Vineyard.rowLayout` placements use `rowId` (UUID). Do not rewrite saved layouts.
- Seed tasks / harvests / activities call `rowId("L1")` etc.
- Act-from-map and health scoring are live. Do not touch them except where they hardcode L1/S1 as a string key.

==================================================
REQUIREMENTS
==================================================

1) Mapping (exact)

   L1→NS1 North South 1  
   L2→NS2 North South 2  
   L3→NS3 North South 3  
   L4→NS4 North South 4  
   S1→EW1 East West 1  
   …  
   S11→EW11 East West 11  

   Keep variety, plantedYear, status, vineCount, length, notes, axis. Only code + name change. Do not restore “North Slope” / “Hilltop East”.

2) Seed upsert must survive both worlds

   For each mapped row:
   - Find by new code first (`NS1`).
   - Else find by old code (`L1`) and UPDATE code + name in place.
   - Else create with the new code/name.

   Never create L1 if NS1 already exists. Never leave both L1 and NS1.

   Point `rowId("NS1")` (and the rest) at the resolved row. Update every `rowId("L1")` / `rowId("S2")` in tasks, harvests, and activities.

3) Layout defaults

   In `packages/shared/src/layout.ts`, rename keys L1–L4 → NS1–NS4 and S1–S11 → EW1–EW11. Keep the same x / y / rotationDeg / grid slots. NS stays 90°, EW stays 0°.

   If any web file still has a hardcoded `L1`/`S1` layout map, update it the same way.

4) Docs

   `VineyardManager/CONTINUE.md`: last completed = seed + default layout use NS1–NS4 / EW1–EW11. Next = role checks on writes (or whatever it already said after act-from-map). No photo underlay.

   Keep `docs/scripts/Rename-VineyardRows.sql` as-is unless a comment is needed that seed now matches it.

==================================================
OUT OF SCOPE
==================================================
- Act-from-map UI, health formula, Auth, logo
- Photo underlay, GIS, RBAC
- Changing vine counts or lengths
- New rows beyond NS1–4 and EW1–11
- Rewriting Express / Prisma / TanStack Query

==================================================
DONE WHEN
==================================================
- `pnpm db:seed` on a DB that already has NS* / EW* does not create L* / S* duplicates
- `pnpm db:seed` on a DB that still has L* / S* renames them in place to NS* / EW*
- Default layout keys are NS1–NS4 and EW1–EW11
- Seed tasks/harvests/activities resolve via the new codes
- Saved dashboard positions still work (rowId unchanged)
- CONTINUE.md updated
