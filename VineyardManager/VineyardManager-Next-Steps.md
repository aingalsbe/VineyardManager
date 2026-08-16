grok --resume 01a002e3-8089-7da2-b47e-782b6e2615c1

# Vineyard Manager – Next Steps to Functional MVP

Follow these steps **in order**.  
Run the terminal commands in PowerShell from your `VineyardManager` folder.  
Paste the Grok Build prompts exactly as written (or adjust slightly if your folder names differ).

---

## Phase 1 – Verify & Run the Scaffold

### 1.1 Confirm structure and start the frontend
```powershell
cd AIProjects\VineyardManager
dir
cd apps\web
npm install
npm run dev
```
→ Open the URL it gives you (usually http://localhost:5173) and confirm the basic React app loads.

### 1.2 (Optional) Quick Grok Build check
```powershell
cd ..\..   # back to VineyardManager root
grok
```
**Prompt:**
```
Show me the current project tree and confirm the React + Vite app in apps/web is correctly set up. Also list what database schema files currently exist.
```

---

## Phase 2 – Backend Foundation

### 2.1 Install backend dependencies & set up the API
```powershell
cd apps\api
npm init -y
npm install express cors dotenv pg  # or prisma / drizzle if you prefer
npm install -D typescript tsx @types/express @types/node @types/cors
```

### 2.2 Grok Build – Create a solid API skeleton
From the project root run `grok`, then paste:

```
Create a clean Express + TypeScript API in apps/api that:
- Uses a proper folder structure (src/routes, src/controllers, src/db, src/types)
- Connects to a Postgres database using the schema we already created
- Has a health check endpoint
- Has basic CRUD routes for:
  - Vineyard Blocks / Parcels
  - Tasks
  - Harvests
- Uses environment variables for the database connection
- Includes a simple README for the API

Also create a .env.example file and update the root .gitignore if needed.
```

### 2.3 Create and fill the environment file
```powershell
cd apps\api
copy .env.example .env
# Then edit .env with your actual database credentials
```

---

## Phase 3 – Database Ready

### 3.1 Run migrations / create tables
(Adjust the command based on what Grok created — Prisma, Drizzle, or raw SQL)

**If using Prisma:**
```powershell
npx prisma migrate dev --name init
npx prisma generate
```

**If using raw SQL or another tool:**
Ask Grok:
```
Show me the exact commands to create the database tables from the schema we defined.
```

### 3.2 Seed some sample data
**Grok prompt:**
```
Create a seed script that inserts realistic sample data:
- 4–5 vineyard blocks with different varieties
- 8–10 tasks linked to those blocks
- 3–4 harvest records
Make it easy to run with one command.
```

Then run the seed command Grok gives you.

---

## Phase 4 – Connect Frontend ↔ Backend

### 4.1 Add API client and basic data fetching
**Grok prompt (from project root):**
```
In the apps/web React app:
- Create a simple API client (using fetch or axios)
- Create React Query (or SWR) setup
- Build a BlocksList page that fetches and displays the vineyard blocks from the API
- Add basic loading and error states
- Make sure the dev server proxy or CORS is configured correctly so the frontend can talk to the API on a different port
```

### 4.2 Start both servers
Terminal 1 (API):
```powershell
cd apps\api
npm run dev
```

Terminal 2 (Frontend):
```powershell
cd apps\web
npm run dev
```

---

## Phase 5 – Core Features (in priority order)

Run these one at a time in Grok Build:

1. **Blocks / Parcels CRUD**
```
Implement full Create / Edit / Delete for vineyard blocks in both the API and the React frontend. Include a simple form and a detail view.
```

2. **Tasks**
```
Add task management: list tasks by block, create new tasks, mark complete, and filter by status. Keep the UI clean and mobile-friendly.
```

3. **Harvest Logging**
```
Build the harvest recording feature: select a block, enter yield, date, notes, and crew. Show a simple harvest history per block.
```

4. **Dashboard**
```
Create a main dashboard that shows:
- Total blocks and total acreage
- Upcoming / overdue tasks
- Recent harvests
- Quick action buttons
```

---

## Phase 6 – Polish & Make It Usable

**Grok prompts (run as needed):**

```
Add basic authentication (email/password or magic link) so multiple users can eventually use the app. Keep it simple for now.
```

```
Make the UI responsive and improve the visual design using Tailwind + shadcn/ui components. Focus on clean vineyard/agriculture aesthetic.
```

```
Add a simple search and filter bar on the blocks and tasks pages.
```

```
Write a short user guide in docs/USER_GUIDE.md explaining how to use the main features.
```

---

## Daily Working Commands (cheat sheet)

```powershell
# Start everything
cd AIProjects\VineyardManager\apps\api   →  npm run dev
cd AIProjects\VineyardManager\apps\web   →  npm run dev

# Open Grok Build from project root
cd AIProjects\VineyardManager
grok
```

---

## Recommended Order Summary

1. Verify frontend runs  
2. Build & run API  
3. Connect database + seed data  
4. Connect frontend to API and show blocks  
5. Add full Blocks CRUD  
6. Add Tasks  
7. Add Harvests  
8. Build Dashboard  
9. Auth + polish  

---

Would you like me to generate the exact next Grok prompt for whatever phase you’re currently on?
