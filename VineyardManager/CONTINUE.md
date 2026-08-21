# Continue Here – Vineyard Manager

## Last Completed
- Monorepo set up with pnpm + Turborepo (apps/web, apps/api, packages/shared)
- Prisma schema + migration applied (users, vineyards, rows, tasks, harvests)
- Postgres running via Docker
- Seed data loaded and verified
- Rows page connected to the API (create/edit)
- Tasks: list (filter by row/status), create, edit, mark complete / change status
- Harvest logging: first-class Harvest model, record yield against a row, harvest history at /harvests
- Dashboard: summary stats (active rows, total length, vines), upcoming/overdue tasks, recent harvests, quick actions
- Start-VineyardManager.ps1 and Stop-VineyardManager.ps1 scripts working
- Project backed up to NAS + private GitHub repo

## Next Priority
- Activities / Log work: wire the existing Activities page to persist real vineyard work (or auth, if you want users before more writes)

## Notes
- Working directory: C:\AIProjects\VineyardManager
- Use the existing Start/Stop scripts when resuming
- Dashboard: http://localhost:5173/
- Rows: http://localhost:5173/rows
- Tasks: http://localhost:5173/tasks
- Harvests: http://localhost:5173/harvests
