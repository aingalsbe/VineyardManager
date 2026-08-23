# Functional requirements (paste into the PRD)

Copy the table below into **Vineyard Manager Requirements → Functional requirements**, replacing the placeholder rows (`P0 | Add requirement`).

Priority: **P0** = Must-have, **P1** = Should-have, **P2** = Nice-to-have.

| Priority | Detailed description |
| :---- | :---- |
| P0 | The product shall be a website (and later an Android app) for a **small vineyard owner** (power user) to set up, monitor, and manage their own vineyard. It shall not be built as a multi-tenant marketplace. |
| P0 | The owner shall sign in with **email and password**. Until signed in, vineyard data shall not be shown. Password and email shall be updatable in settings. |
| P0 | After sign-in, the owner shall land on a **dashboard** that shows vineyard health at a glance, upcoming maintenance, and recent harvests, with navigation to setup and management. |
| P0 | The owner shall **set up a vineyard**: name, address (used later for weather and calendar), and timezone. |
| P0 | The owner shall create and edit **rows** with a unique code per vineyard (`L1`, `S1`, etc.), a human name, grape variety, vine count, row length (feet and inches), planting year, status, and notes. |
| P0 | The owner shall record **maintenance and observations** against the whole vineyard, a row, a variety, or (when vines exist) an individual vine, dated today by default: pruning; watering (duration in 15-minute steps; drip / flooding / hose / sprinkler); fertilization (product, amount per vine); pest prevention (spray / dust / proximity, product, targets, amount); weed prevention (spray / dust / manual); harvest; health observation (pests, vine/leaf/cluster damage, notes). |
| P0 | The owner shall record **harvest yield** against a row: date, amount, unit (lb, kg, lug, bin, flat, bushel, or other), optional crew, and notes. Harvest history shall be viewable by row and on the dashboard. |
| P0 | The owner shall create, edit, and complete **scheduled tasks** (maintenance, weather, health summary), optionally linked to a row, with a due date and status. The dashboard shall show upcoming and overdue tasks. |
| P0 | Each row shall have a **health color** using these defaults (customizable later): Green 80–100% (no major actions); Yellow 70–80% (potential actions); Orange 60–70% (action needed soon); Red below 60% (immediate attention). The owner shall be able to see why a row is that color and what to do next. |
| P0 | The website shall be usable **in the field**: responsive, high-contrast colors, and large readable type for older users. Vineyard views, setup, and admin require internet. |
| P1 | The owner shall enter **grape varieties** for the vineyard. The app should look up typical characteristics (water needs, prune window, pest susceptibility) and allow manual override. |
| P1 | Setup shall capture **how far apart vines are planted** and which variety (and how many vines of each) is in each row. |
| P1 | From the vineyard address, the app should **seed a typical Jan–Dec calendar** (fertilization, pruning, pest control, weed control, harvest, vine replacement, dormant period, winterization, watering) that the owner can customize. |
| P1 | The owner shall customize **health color rules** (what counts as red/yellow/orange/green and how far in advance a missed task changes color) and **weather notification** prefs (severe weather, drought/overwater, frost/snow). |
| P1 | After an activity is saved, the system should **calculate the next** watering, fertilization, pest, and weed windows from variety guidance, weather, time of year, and product specs, then create or update tasks and refresh health. |
| P1 | During the growing season the owner (and managers) shall receive **weekly notifications**: upcoming maintenance, potential weather impacts, and a short vineyard health summary. Notification frequency shall be configurable. |
| P1 | The product shall support three **roles**: Power User (full setup, management, and user admin); Manager (view/manage vineyard, receives notifications); Viewer (read-only health and suggested tasks, no notifications, cannot manage). |
| P1 | A Power User shall **invite managers and viewers** by email and change or revoke their role. |
| P1 | Vineyard management actions (log work, harvest, tasks) shall **work offline** in the field and sync when connectivity returns. Setup, map/health views, and admin require connectivity. |
| P1 | The dashboard and row views should show a **visual map** of correctly oriented, labeled rows with the health color overlay. Selecting a row shows the color reason and suggested mitigations. |
| P1 | An **assistant** shall use vineyard state and recent work to explain health and suggest remedies or the next maintenance window; the owner can confirm or edit suggestions. |
| P1 | The website shall run on **Windows and Apple** computers in Chrome and Safari (current versions). |
| P2 | An **Android app** shall provide the same dashboard, setup, and field logging as the website, including offline logging. |
| P2 | The owner shall manage **individual vines** in a row (position, variety override, planted date, active/replaced/removed) and apply activities to a single vine. |
| P2 | The owner shall apply the **same activity to many rows or vines** in one action (bulk log). |
| P2 | Harvest logging shall capture **cluster condition** (best, better, good, pest damage, unusable) in addition to weight/yield, entered per vine or per row. |
| P2 | Weather integration shall pull **local forecasts and alerts** (hail, wind, tornado, rain/snow, frost, drought) for the vineyard address and feed calculations and notifications. |
| P2 | Variety characteristics and calendar defaults shall be enriched from **public extension / growing sources** (for example K-State grape guides), with manual override always available. |
| P2 | AI may analyze **written health observations** and update row health rationale; it shall not use photos of leaves, pests, or damage. |

## Non-goals (do not paste as P0–P2 rows; keep in the PRD Non-goals section)

- Not a marketable product for a large audience.
- No camera or picture analysis of vine leaves, pests, or damage.
