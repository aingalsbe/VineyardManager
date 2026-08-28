# Continue Here – Vineyard Manager

## Last Completed
- Monorepo set up with pnpm + Turborepo (apps/web, apps/api, packages/shared)
- Prisma schema + migration applied (users, vineyards, rows, tasks, harvests, activities)
- Postgres running via Docker
- Seed data loaded and verified
- Rows page connected to the API (create/edit)
- Tasks: list (filter by row/status), create, edit, mark complete / change status
- Harvest logging: first-class Harvest model, record yield against a row, harvest history at /harvests
- Dashboard: summary stats, upcoming/overdue tasks, recent harvests, quick actions
- Activities / Log work: list + create (vineyard or row scope), filters, persist in Postgres
- Auth: email + password login, JWT on `/api/v1` (except health + login), gated UI, `performedBy` on new activities
- Health colors v1: schematic map + scores on Dashboard, chips on Rows; inventory stats moved to Setup
- Vineyard create/edit on Setup; logo upload shown in the top header on every signed-in page
- Setup row layout editor; Vineyard.rowLayout saved; bar length from vineCount; Dashboard uses saved positions + health colors; seed vineyard named Abide in the Vine Vineyard
- Start-VineyardManager.ps1 and Stop-VineyardManager.ps1 scripts working
- Project backed up to NAS + private GitHub repo

## Next Priority
- Photo/sketch underlay on the layout pad, or role checks on writes. Layout positions persist; an underlay would make dragging match the real property. Role checks can wait until the map is the grower’s vineyard.

## Notes
- Working directory: C:\AIProjects\VineyardManager
- Use the existing Start/Stop scripts when resuming
- Demo login: owner@vineyard.local / VineyardDev1! (manager@vineyard.local uses the same password)
- Dashboard: http://localhost:5173/
- Rows: http://localhost:5173/rows
- Tasks: http://localhost:5173/tasks
- Harvests: http://localhost:5173/harvests
- Log work: http://localhost:5173/activities
- Activity API: GET/POST /api/v1/vineyards/:id/activities ; GET/DELETE /api/v1/activities/:id
- Auth API: POST /api/v1/auth/login, POST /api/v1/auth/logout, GET /api/v1/auth/me
- Health API: GET /api/v1/vineyards/:id/health
- Vineyard API: POST/PATCH /api/v1/vineyards (including `rowLayout`), PUT/GET/DELETE /api/v1/vineyards/:id/logo
- Setup: http://localhost:5173/setup
- Harvest type on Log work is a note only — yield still lives on Harvests
