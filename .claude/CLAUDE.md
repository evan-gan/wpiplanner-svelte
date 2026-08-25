# WPI Planner (Svelte rewrite) — project index

## What this project does

Course schedule planner for WPI. A student picks courses and blocks off times
they are unavailable; the app enumerates every conflict-free combination of
sections and renders them as weekly grids. Fully client-side and static — there
is no server and no API.

This is a ground-up rewrite of the GWT/Java app in `../wpiplanner-master`, which
is deployed at https://planner.wpi.edu/. **Read [`PLAN.md`](../PLAN.md) first** —
it holds the audit findings, the target structure, and the file-by-file parity
ledger against the old app.

## Status

All four tabs are built and the app runs end to end against the real catalog.
Phases 0–2 are complete and gated by tests; phases 3–6 are built but their gates
are manual side-by-side checks against the deployed old app, which have not been
done.

The search has been checked against the original GWT algorithm itself — see
`tools/parity-oracle/`. All five golden course sets agree exactly, and the
chosen-times boundary question (PLAN.md §10.5) is settled in the old app's
favour, so there is no known behavioural difference in the search.

**Picking this up? Read [PLAN.md §11](../PLAN.md) — it is the handoff: what
exists, what is left in priority order, and what to know before changing the
search.** §6 has the per-phase gates, §8 lists the four places the rewrite
deliberately departs from the old app, and §10.5 is the one open question that
blocks cutover.

`pnpm test` runs 62 tool tests and 289 app tests.

## Structure

Files that carry the most weight, and what to change where.

### Data pipeline

| Path | What lives there |
|---|---|
| `tools/schedb-to-json/` | Build-time converter, Workday `.schedb` XML → `static/schedb.json`. Never ships to the browser. Has its own [README](../tools/schedb-to-json/README.md) and `tests/`. |
| `src/lib/model/schedb.ts` | **Single source of truth** for the `schedb.json` shape. Imported by both the app and the converter, so they cannot drift. |
| `src/lib/data/loadCatalog.ts` | Fetches and validates `schedb.json`, with byte progress. Replaces `Scheduler.java` + `LoadSchedule.java`. |
| `src/lib/data/yearHeader.ts` | The two-line `yearHeader.txt` (academic year, whether to show the `/old` link). |
| `data/` | Build inputs (`new.schedb`) and the generated anomaly report. Not served. |
| `static/` | Served verbatim, including the generated `schedb.json`. |

### Model — pure data, no DOM, no state

| Path | What lives there |
|---|---|
| `src/lib/model/catalog.ts` | `Catalog`: indexes the JSON by department/course/section id, resolves pooled descriptions, walks section → course → department. Replaces `ScheduleDB`. |
| `src/lib/model/time.ts` | Minutes-since-midnight helpers, 12-hour formatting, and `snapToBlockStart`. |
| `src/lib/model/days.ts` | `DAY_BITS` mask helpers. Also re-exported by the converter. |
| `src/lib/model/terms.ts` | `TermName` parsing, ordering, labels. |
| `src/lib/model/timeGrid.ts` | The `TimeCell` constants and grid math. A test pins the five constants. |
| `src/lib/model/availability.ts` | seats/waitlist → `open` / `waitlist` / `full`, per section, per course, per term. |

### Scheduling — the algorithm, no DOM

| Path | What lives there |
|---|---|
| `src/lib/scheduling/types.ts` | `GeneratorSection`, `ChosenTimes`, `Problem`, `SchedulePermutation`. All structured-cloneable. |
| `src/lib/scheduling/conflicts.ts` | Pairwise section conflicts and the precomputed index. Replaces `ConflictController`. |
| `src/lib/scheduling/timeConflicts.ts` | Section × chosen-times cells. **Read the header comment before touching it** — the block snapping and the out-of-grid rule are both load-bearing. |
| `src/lib/scheduling/generator.ts` | The DFS, ported closely from `ScheduleProducer`. Also `streamPermutations`, the chunked driver the worker runs. |
| `src/lib/scheduling/problems.ts` | Conflict-resolver suggestions: construction, equality, text, and applying one. |
| `src/lib/scheduling/referenceGenerator.ts` | Brute-force oracle. **Tests only** — exponential, no pruning. |
| `src/lib/scheduling/worker/` | `protocol.ts` (message types), `generator.worker.ts` (runs the search off-thread), `client.ts` (typed wrapper, with a synchronous fallback). |

### State — Svelte 5 runes

| Path | What lives there |
|---|---|
| `src/lib/state/app.svelte.ts` | `AppState`, put into context by the layout. Owns the one cross-cutting rule: **a change to the choices calls `refresh()`, which restarts the search.** Start here. |
| `src/lib/state/selection.svelte.ts` | Chosen courses and denied sections; the 18-course limit. Replaces `StudentSchedule`'s course half plus every `SectionProducer`. |
| `src/lib/state/chosenTimes.svelte.ts` | The per-term availability grid and its drag semantics. |
| `src/lib/state/favorites.svelte.ts` | Starred schedules, stored as section ids. |
| `src/lib/state/permutations.svelte.ts` | Drives the worker, holds results and the selected schedule, and the 17-colour palette. |
| `src/lib/state/timeRange.svelte.ts` | The hours the grids show. |
| `src/lib/state/persistence.ts` | All `localStorage` reads and writes. Every function is total: a corrupt payload yields the default. |

### Routes and components

| Path | What lives there |
|---|---|
| `src/routes/+layout.ts` | Loads the catalog and the year header for every route. `ssr = false`, `trailingSlash = 'always'`. |
| `src/routes/+layout.svelte` | Creates `AppState`, applies a `?share=` link, renders header + tabs. |
| `src/routes/{courses,info,times,schedules}/+page.svelte` | One route per tab, in `TabList.addTab` order. |
| `src/lib/components/shell/` | `AppHeader`, `TabBar`. |
| `src/lib/components/primitives/` | `SplitPane`, `ScrollArea`, `Modal`, `ToggleButton`, `WarningIcon`. Generic, no app knowledge. |
| `src/lib/components/catalog/` | The Courses tab: `DepartmentPicker` (the six academic groups live here), `CourseTable`, `CourseRow`, `TermBadges`, `CourseDetails`, `SelectedCourseList`. |
| `src/lib/components/times/` | `TermTimeTabs`, `TimeGrid`, `TimeGridCell`. |
| `src/lib/components/schedules/` | `SchedulePane` (the view-mode switch), `SectionPicker`, `ScheduleThumbnailList` / `ScheduleThumbnail` (canvas), `QuarterGrid`, `WeekGrid`, `WeekGridColumn`, `PeriodBlock`, `DetailedView`, `SectionDetailsDialog`, `ConflictResolver`, `GenerationProgress` (canvas), `ShareLink`. |
| `src/lib/styles/` | `tokens.css` (every colour and size lifted from the old app) and `reset.css`. |
| `src/lib/share/shareCode.ts` | Encode/decode `?share=`. Version-prefixed; old hex-CRN links are rejected, not migrated. |

### Tests

`tests/` mirrors `src/lib/`. Two suites matter more than the rest:

- `tests/scheduling/generator.parity.test.ts` — the ported DFS against the
  brute-force oracle over 1,000 random course sets. This is the test that would
  catch a bad refactor of the search.
- `tests/data/realCatalog.test.ts` and `tests/scheduling/goldenSets.test.ts` —
  run against the real `static/schedb.json` and skip themselves when it is
  absent.

`tests/fixtures/` holds a three-course `MINI_CATALOG` and readable builders such
as `section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon,wed,fri'])`.

`tools/parity-oracle/` sits outside `pnpm test` because it needs a JDK. It runs
the **original** GWT `ScheduleProducer` off-browser over the same `.schedb`, so
it can answer "does the port find the same schedules the old app would" directly.
Reach for it whenever a change to the search could alter which schedules exist:
`tools/parity-oracle/run.sh data/new.schedb CS2102,MA1021`. Its
[README](../tools/parity-oracle/README.md) lists which files are original, which
are stubs, and why no stub can change a count.

## Commands

```bash
pnpm install           # once; esbuild's postinstall must be allowed to run
pnpm run data:build    # .schedb XML -> static/schedb.json + data/schedb-report.json
pnpm dev               # dev server
pnpm build             # static site into build/ (run data:build first, or use build:full)
pnpm test              # tool tests (node --test) + app tests (vitest)
pnpm run test:tools    # tool tests only — no install needed, uses Node type stripping
pnpm run check         # svelte-check; must stay at 0 errors, 0 warnings

tools/parity-oracle/run.sh data/new.schedb CS2102,MA1021   # legacy search, needs a JDK
```

## Conventions specific to this repo

- **Section identity is `${dept}|${courseNumber}|${sectionNumber}`, never the CRN.**
  149 CRNs in the catalog are shared by cross-listed sections, and the 18-digit
  values exceed `Number.MAX_SAFE_INTEGER`. `crn` is a display-only string.
- **Times are minutes since midnight; days are a 7-bit mask** (`DAY_BITS`).
- **`src/lib/model/*.ts` imports its siblings with an explicit `.ts` extension.**
  Those four files are shared with `tools/`, which runs under Node type stripping
  and does not remap `.js` → `.ts`. Everything else under `src/` uses
  extensionless `$lib/...` imports.
- **`localStorage` keys are namespaced `wpiplanner.v2.*`.** Every stored format
  changed in the rewrite; the legacy keys are ignored, not migrated.
- **The mapper throws on structural surprises and logs data oddities.** A changed
  upstream export fails the build; 489 rows with `days="?"` do not.
- **Adding or removing a feature means updating PLAN.md §5 and this file.**

## Two behaviours that look like bugs and are not

- **A course whose sections are all switched off drops out of the search
  entirely**, rather than making the schedule impossible. The legacy producer
  skipped empty section lists the same way. This is why adding a fully-closed
  course such as CS1004 changes nothing.
- **Cells outside the chosen-times grid count as blocked, so evening and weekend
  sections are never schedulable.** The grid covers Monday–Friday, 8:00AM–6:00PM,
  and a cell outside it can never be selected. This matches the old app and is a
  deliberate decision, not an oversight — PLAN.md §10.5 has the reasoning and the
  measured cost (20 of MA1021's 79 open sections). The legacy NPE on weekend
  sections *is* fixed: they are ordinary conflicts. Conflict cells carry
  `insideGrid`, and the resolver must not offer to re-enable one that is false.
