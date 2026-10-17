# Plan: Close Season and New Season in Vineyard Setup

Plan written by Devon, Oct 2026. Aaron answered the questions Oct 17, 2026.

This is the plan for the two new Vineyard Setup features. It's based on how the app works today, and nothing has been built yet. Each section starts with what we recommend, and four questions for you are at the end.

## 1. What we'd store for each season

We recommend a Season record for each vineyard. It holds the year, whether the season is active or closed, when it started and closed, a frozen copy of that year's numbers, and the written Season Summary. Dormant is a state of the vineyard between seasons, not of the season itself.

How tasks, harvests and activities get tied to a season:

- **Tag every record with its season (recommended).** It's exact and fast, and a late harvest or early pruning lands in the season you meant. It needs a one-time pass to tag existing records.
- **Work it out from dates.** There's nothing to tag, but a December pruning or a late-logged harvest could land in the wrong year.

For the records you already have, we'd tag everything by calendar year, create one season per past year with data, and leave this year open.

**What "locked" means:** once a season is closed, nobody can change or delete its tasks, harvests or activities, including power users. That keeps the frozen numbers and the records behind them in agreement. If something really needs fixing, you'd use Reopen Season (see section 6).

## 2. Close Season

**Who can do it:** power users only, the role your owner account already has, so there's no new owner role. Managers can still view everything.

**How it works:** you press Close Season in Vineyard Setup. A preview shows how many open tasks will be closed, the year's harvest totals, waterings, pest and weed treatments, and the current health score. Then you confirm.

What happens to tasks that are still open:

- **Mark them Dismissed (recommended).** That status already exists, and the summary will show they were closed by the season close rather than done.
- **Add a new "Closed at season end" status.** The meaning is clearer, but every screen, badge and count would need updating.

While the vineyard is dormant:

- The Dashboard shows a "Dormant since [date]" banner with a button to start a new season.
- Health shows a neutral Dormant badge instead of a color, so overdue penalties don't pile up over winter.
- The daily rain check and the weekly digest skip the vineyard. The weather card keeps working.

## 3. Season Summary

We recommend one summary, created at close and built from rules rather than AI. It covers:

- health at close plus a month-by-month trend
- harvest totals by variety and by row, compared with last year
- waterings, fertilizing, and pest and weed treatments
- tasks done on time, done late, and dismissed
- notable weather: frost days, heavy-rain days and dry spells

Example rules for positives and negatives:

- Harvest up more than 10% from last year is a positive; down more than 10% is a negative.
- 90% or more of tasks done on time is a positive.
- A row that produced nothing this year is a negative.
- Pest pressure reported with no treatment logged within 14 days is a negative.
- Health ending green is a positive; ending orange or red is a negative.

The summary is saved with the season and doesn't change later. A new Past Seasons page lists each year and opens its summary. It's also emailed to managers and power users in the same style as the weekly digest. Until you approve real sends, test emails only go to your Gmail.

## 4. New Season

We recommend this order:

1. You press New Season.
2. The app creates Dormant Pruning first, due before bud break.
3. It builds a suggested calendar from the vineyard's location and grape varieties.
4. You review it, uncheck tasks or move dates, and then create it.

How much control you get:

- **Preview, then create (recommended).** You keep control without typing the calendar yourself.
- **Create automatically.** It's faster, but wrong dates become clutter you have to clean up.

**How the dates are worked out:** the app pulls about 10 years of past weather for your exact location from Open-Meteo, the free weather service it already uses. From that it estimates your typical last spring frost, your first fall frost, and "growing degree days." Degree days are the standard grape-growing measure of warmth built up through the season above 50°F, and each growth stage tends to arrive at a predictable total:

| Stage | Typical point | Source |
|---|---|---|
| Bud break | Around 150–250 degree days from January 1 | Our estimate; research shows it varies a lot by grape |
| Bloom | About 30 days before berries reach half their final weight | Michigan State Extension rule of thumb |
| Berries at half weight | About 1,070–1,200 for early grapes (Chardonnay, Pinot Noir, Concord); about 1,470–1,700 for later ones (Seyval, Traminette, Merlot), counting from April 1 | Michigan State Extension |
| Veraison (berries soften and color) | About 1,670–1,760 | Washington State research |
| Harvest | About 2,750–3,030 for cold-hardy hybrids (Marquette, Frontenac, Vignoles) | Nebraska study |

Our early, mid and late harvest bands of roughly 2,200, 2,600 and 3,000 are estimates built from these numbers. Harvest tasks will say "start checking sugar levels," not "pick on this date."

Each variety gets an early, mid or late tag. You set it once, and the app suggests one for well-known grapes. Later varieties push the harvest window back.

**Suggested tasks:** Dormant Pruning, spring fertilizing after bud break, a vine replacement check, weed strip passes, pest scouting every two weeks from bloom to veraison, a midsummer water check, a harvest window per variety, and winterizing after first frost.

## 5. What it would look like

- Vineyard Setup gets a Season card showing this year's season and its status, with Close Season or New Season depending on the state.
- Close Season opens a preview that lists what will happen and asks for a deliberate confirm, since it's hard to undo.
- New Season opens the suggested calendar grouped by growth stage, with a checkbox and an editable date on each task, then a Create button.
- Past Seasons is a simple list of years, each opening a summary page that matches the email.
- While dormant, the Dashboard shows the banner and the neutral health badge.
- Everything uses the app's blue styling and works on a phone.

## 6. Other situations

- **Closing mid-season** is allowed. The preview warns you, and anything logged afterward goes into the next season.
- **New Season without closing first** is blocked. New Season only appears once the vineyard is dormant.
- **Undo:** power users get a Reopen Season button for 30 days. It unlocks the records and clears the frozen summary, but dismissed tasks stay dismissed.
- **More than one vineyard:** each vineyard has its own seasons.
- **Time zones:** season years and dates follow the vineyard's own time zone.

## 7. Build order

Each step can ship on its own and gets QA before the next one starts.

1. **Seasons and tagging.** Existing records get tagged to the right year and this year stays open. *Check:* totals match today's Metrics page.
2. **Close Season preview and close.** *Check:* viewers and managers are refused, open tasks become dismissed, the vineyard shows dormant, and the rain check and digest skip it.
3. **Lock and Reopen.** *Check:* editing or deleting a closed-season record is refused with a clear message, and Reopen works.
4. **Summary, Past Seasons page and email.** *Check:* summary numbers match the frozen numbers, and the test email reaches only the test list.
5. **New Season with today's fixed calendar plus Dormant Pruning,** with preview, uncheck and adjust. This also fixes a current bug: today's calendar setup skips any task title that was ever used before, so a second year would get no tasks. *Check:* a second season gets a full calendar, and unchecked tasks aren't created.
6. **Location-based dates.** These replace the fixed dates and fall back to the fixed calendar if weather data isn't available. *Check:* dates come out as expected for at least two test locations.

## Questions for you

1. Should only power users close and start seasons, or managers too?
2. Should open tasks at close be marked Dismissed, or do you want a separate "Closed at season end" status?
3. Who should get the Season Summary email: all managers and power users, or only you?
4. Can you tell us early, mid or late for each of your varieties, or should the app suggest them for you to confirm?

## Answers (Oct 17, 2026)

1. **Power users only** can close and start seasons.
2. Open tasks at close become **Dismissed** and show on the Season Summary.
3. The Season Summary email goes to **power users and managers**. Until Aaron approves real sends, test sends go only to aingalsbe@gmail.com.
4. The app **suggests early, mid or late** per variety from research plus the growing area (degree days), and the user confirms or overrides.
