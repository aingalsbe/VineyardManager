# Continue Here – Vineyard Manager

## Last Completed
- Monorepo set up with pnpm + Turborepo (apps/web, apps/api, packages/shared)
- Prisma schema + migration applied (users, vineyards, rows, tasks, harvests)
- Postgres running via Docker
- Seed data loaded and verified
- Rows page connected to the API (create/edit)
- Tasks: list (filter by row/status), create, edit, mark complete / change status
- Harvest logging: first-class Harvest model, record yield against a row, harvest history at /harvests
- Start-VineyardManager.ps1 and Stop-VineyardManager.ps1 scripts working
- Project backed up to NAS + private GitHub repo

## Next Priority
- Dashboard: total rows/acreage-or-length, upcoming/overdue tasks, recent harvests, and quick actions

## Notes
- Working directory: C:\AIProjects\VineyardManager
- Use the existing Start/Stop scripts when resuming
- Rows: http://localhost:5173/rows (Record harvest on each card)
- Tasks: http://localhost:5173/tasks
- Harvests: http://localhost:5173/harvests
- Harvest API: /api/v1/harvests (not through Activities)
