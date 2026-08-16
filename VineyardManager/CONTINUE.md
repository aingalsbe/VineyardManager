# Continue Here – Vineyard Manager

## Last Completed
- Monorepo set up with pnpm + Turborepo (apps/web, apps/api, packages/shared)
- Prisma schema + migration applied (users, vineyards, rows, tasks)
- Postgres running via Docker
- Seed data loaded and verified
- Rows page connected to the API and displaying real data
- Full Create and Edit for Vineyard Rows
- Full Tasks feature: list (filter by row/status), create, edit, mark complete / change status, tasks linked to rows
- Start-VineyardManager.ps1 and Stop-VineyardManager.ps1 scripts working
- Project backed up to NAS + private GitHub repo

## Next Priority
- Harvest logging: record yield/date/notes against a row, and show harvest history

## Notes
- Working directory: C:\AIProjects\VineyardManager
- Use the existing Start/Stop scripts when resuming
- Rows live at http://localhost:5173/rows
- Tasks live at http://localhost:5173/tasks
- Task statuses in the DB are still `pending` / `sent` / `acknowledged` / `dismissed` (UI labels: Not started / In progress / Complete / Dismissed)
