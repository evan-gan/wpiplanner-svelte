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

`pnpm test` runs 62 tool tests and 411 app tests.

## Structure

Files that carry the most weight, and what to change where.

### Data pipeline

| Path | What lives there |
|---|---|
| `tools/workday-to-schedb/` | **The live data path.** Fetches WPI's Workday feed and writes `static/schedb.json` + `static/yearHeader.txt` — `pnpm updateData`. Start here to refresh the catalog. Has its own [README](../tools/workday-to-schedb/README.md) and `tests/`. |
| `tools/schedb-to-json/` | The older converter, `.schedb` XML → `static/schedb.json`. Kept for `data/new.schedb`, the export the search was verified against. Its own [README](../tools/schedb-to-json/README.md) and `tests/`. |
| `tools/shared/` | `DescriptionPool` and `AnomalyLog`, used by both converters. |
| `src/lib/model/schedb.ts` | **Single source of truth** for the `schedb.json` shape. Imported by both the app and both converters, so they cannot drift. |
| `src/lib/data/loadCatalog.ts` | Fetches and validates `schedb.json`, reporting byte progress (`onProgress`) and the current step (`onStage`: connecting/downloading/parsing). Replaces `Scheduler.java` + `LoadSchedule.java`. |
| `src/lib/data/yearHeader.ts` | The two-line `yearHeader.txt` (academic year, whether to show the `/old` link). |
| `data/` | `new.schedb`, the pinned February 2025 export, and the generated anomaly report. Not served. |
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
| `src/lib/model/sectionFilters.ts` | Filters over a course's sections — currently by professor. Each option names the sections it covers and stores nothing, so the filter menu and the section checkboxes cannot disagree. **Add a filter by adding a builder to `SECTION_FILTER_BUILDERS`.** |

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

### Calendar export — dates, no DOM

| Path | What lives there |
|---|---|
| `src/lib/config/academicCalendar.ts` | **Hand-maintained.** Term start/end dates, no-class days, "follow X schedule" days, and breaks. None of this is in the Workday export, so it is transcribed from the Registrar's calendar and must be redone every academic year — the rollover checklist is at the bottom of the file. |
| `src/lib/calendar/dates.ts` | `YYYY-MM-DD` arithmetic through UTC, plus `zonedTimeToUtcMillis` (wall clock in an IANA zone → instant, via `Intl`). Never touches the host's local zone. |
| `src/lib/calendar/ics.ts` | RFC 5545 serialisation: escaping, 75-octet folding, VEVENT/RRULE/EXDATE/VALARM. Knows nothing about courses. |
| `src/lib/calendar/timeZones.ts` | The VTIMEZONE block for `America/New_York`. A `TZID` with no VTIMEZONE is rejected by Outlook; writing meetings in UTC instead would shift them an hour at the DST change. |
| `src/lib/calendar/scheduleExport.ts` | The interesting half: schedule + academic calendar → events. Holidays become `EXDATE`s; a day that follows another weekday drops that day's meetings and adds one-off meetings for the followed day's. **One class is one event:** catalog periods that differ only in their days are merged into a single `BYDAY` rule, and back-to-back terms (A/B, C/D) become one series with the recess between them excluded. Non-adjacent terms stay separate. |
| `src/lib/calendar/download.ts` | Blob → anchor click. The only DOM in the folder. |

### Workday import — reading the student's registration, no DOM

| Path | What lives there |
|---|---|
| `src/lib/workday/zip.ts` | A read-only ZIP reader. An `.xlsx` is a ZIP of XML parts; this walks the central directory and inflates through `DecompressionStream`, so the import needs no dependency. ZIP64 and encryption throw rather than decode wrongly. |
| `src/lib/workday/xlsx.ts` | First worksheet → `string[][]`. Scans the XML with regexes, not `DOMParser`, because the tests run under Node. Handles shared strings, inline strings, and lettered column gaps. |
| `src/lib/workday/enrollment.ts` | Sheet rows → one record per enrolled course. **Columns are found by header text, not by letter.** Groups the separate lecture and lab rows of one course back together, strips `(group N)` notes, and drops rows whose registration status says dropped. |
| `src/lib/workday/matchEnrollment.ts` | Enrolled courses + catalog → section ids. **Read the header comment before touching it** — the set-matching rule is the whole feature. |
| `src/lib/workday/index.ts` | `readWorkdayExport(bytes, catalog)`, the four steps in order. Everything is pure; applying the result is the caller's job. |

**Why sets:** Workday names one meeting at a time — `AL01` for the lecture,
`AX01` for its lab — while the catalog stores the combination a student actually
registers for as a single section, `CS|1102|AL01/AX01`. A catalog section matches
when its periods carry exactly the labels Workday listed for that course. An
exact match wins; a section that merely *contains* the listed labels is taken
only when it is the only one, and is flagged `partial`. Anything ambiguous is
left out with a reason rather than guessed at.

### State — Svelte 5 runes

| Path | What lives there |
|---|---|
| `src/lib/state/app.svelte.ts` | `AppState`, put into context by the layout. Owns the one cross-cutting rule: **a change to the choices calls `refresh()`, which restarts the search.** Start here. `importEnrolledSections` applies a Workday import: it replaces the selection and denies every section but the registered one. |
| `src/lib/state/selection.svelte.ts` | Chosen courses and denied sections; the 18-course limit. Replaces `StudentSchedule`'s course half plus every `SectionProducer`. |
| `src/lib/state/chosenTimes.svelte.ts` | The per-term availability grid and its drag semantics. |
| `src/lib/state/favorites.svelte.ts` | Starred schedules, stored as section ids plus a student-editable name (`Favorite N` by default). Lookup, rename, and removal all match on the section *set*, so a regenerated schedule keeps its name. |
| `src/lib/state/permutations.svelte.ts` | Drives the worker, holds results and the selected schedule, and the 17-colour palette. |
| `src/lib/state/timeRange.svelte.ts` | The hours the grids show. |
| `src/lib/state/persistence.ts` | All `localStorage` reads and writes. Every function is total: a corrupt payload yields the default. |

### Routes and components

| Path | What lives there |
|---|---|
| `src/routes/+layout.ts` | Route options only — no data loading. `ssr = false`, `prerender = true`, `trailingSlash = 'always'`. |
| `src/routes/+layout.svelte` | Boot sequence: renders `LoadingScreen` first, then fetches the catalog and year header after mount, then mounts `AppShell`. Owns the load error + retry. |
| `src/routes/{courses,info,times,schedules}/+page.svelte` | One route per tab, in `TabList.addTab` order. `schedules` renders the Workday import alone when no course has been chosen. |
| `src/lib/components/shell/` | `AppShell` (creates `AppState`, applies a `?share=` link, renders header + tabs + the route body), `AppHeader`, `TabBar` (**Times is dimmed until a course is chosen; Schedules is not** — with nothing chosen it shows the Workday import on its own), `LoadingScreen` (the plain white "Loading scheduler database..." page with the byte counter). |
| `src/lib/components/primitives/` | `SplitPane`, `ScrollArea`, `Modal`, `ToggleButton`, `WarningIcon`, `FilterMenu` (funnel button → popover of tick-box filter groups). Generic, no app knowledge. |
| `src/lib/components/catalog/` | The Courses tab: `DepartmentPicker` (the six academic groups live here), `CourseTable`, `CourseRow`, `TermBadges`, `CourseDetails`, `SelectedCourseList`. |
| `src/lib/components/times/` | `TermTimeTabs`, `TimeGrid`, `TimeGridCell`. |
| `src/lib/components/schedules/` | `SchedulePane` (the view-mode switch), `SectionPicker` (section/term checkboxes plus the per-course filter menu), `ScheduleThumbnailList` / `ScheduleThumbnail` (canvas), `FavoriteNameField` (click-to-edit favourite name, used by both the toolbar and the strip), `QuarterGrid`, `WeekGrid`, `WeekGridColumn`, `PeriodBlock`, `DetailedView`, `SectionDetailsDialog`, `ConflictResolver`, `GenerationProgress` (canvas), `ShareLink`, `CalendarExport` (the third toolbar view, "Export to Calendar"), `WorkdayImport` (the fourth toolbar view: the step-by-step instructions, the file picker, and the review dialog — it overrides the progress/conflict-resolver state so it stays reachable with no schedule on screen), `WorkdayInstructions` (the six steps for producing the export, including a drawn SVG of Workday's whole top-right icon bank with the unlabelled export button circled). |
| `src/lib/styles/` | `tokens.css` (every colour and size lifted from the old app) and `reset.css`. |
| `src/lib/share/shareCode.ts` | Encode/decode `?share=`. Version-prefixed; old hex-CRN links are rejected, not migrated. |

### Tests

`tests/` mirrors `src/lib/`. Two suites matter more than the rest:

- `tests/scheduling/generator.parity.test.ts` — the ported DFS against the
  brute-force oracle over 1,000 random course sets. This is the test that would
  catch a bad refactor of the search.
- `tests/data/realCatalog.test.ts` — invariants over whatever `static/schedb.json`
  currently holds (unique ids, resolvable indexes, no section without a period).
  Deliberately not pinned counts: `pnpm updateData` replaces that file.
- `tests/scheduling/goldenSets.test.ts` — the pinned counts, over
  `data/new.schedb`, which it converts at test time. Those numbers were confirmed
  against the original GWT producer by `tools/parity-oracle`, so they belong to
  that one export and must not be re-pinned to a refreshed catalog.
- `tests/workday/realExport.test.ts` — the import against a real
  `View_My_Courses.xlsx` and the real `static/schedb.json`. Asserts that every
  enrolled course resolves to exactly one section, which is what breaks if
  Workday changes its columns or section labelling.

Those three skip themselves when their input file is absent. `tests/fixtures/xlsxBuilder.ts`
writes genuine `.xlsx` bytes (both ZIP compression methods) so the import tests
exercise the container, not just the XML; `tests/fixtures/workdayExport.ts` holds
rows shaped like the real export, awkward parts included.

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
pnpm updateData        # live Workday feed -> static/schedb.json + static/yearHeader.txt
pnpm run data:build    # legacy path: data/new.schedb XML -> static/schedb.json
pnpm dev               # dev server
pnpm build             # static site into build/ (refresh the data first)
pnpm test              # tool tests (node --test) + app tests (vitest)
pnpm run test:tools    # tool tests only — no install needed, uses Node type stripping
pnpm run check         # svelte-check; must stay at 0 errors, 0 warnings

tools/parity-oracle/run.sh data/new.schedb CS2102,MA1021   # legacy search, needs a JDK
```

## Deployment (Vercel)

The site is a pure static bundle — `adapter-static` writes `build/` and there is
no server function anywhere. Vercel serves those files directly.

| File | What it does |
|---|---|
| `vercel.json` | `framework: null` so Vercel does **not** apply its SvelteKit preset (that preset expects `adapter-vercel` and looks in `.vercel/output`). It runs `pnpm run build` and serves `build/` as plain files. `trailingSlash: true` matches `trailingSlash = 'always'` in `src/routes/+layout.ts`. Cache headers: `_app/immutable/*` forever, `schedb.json` and `yearHeader.txt` never — those two are replaced by `pnpm updateData` and must not be served stale. |
| `.vercelignore` | Keeps `data/`, `tools/`, and `tests/` out of the upload. **Every pattern must be anchored with a leading `/`** — an unanchored `data/` also matches `src/lib/data/` and silently strips `loadCatalog.ts` from the deploy. |
| `pnpm-workspace.yaml` | Approves esbuild's postinstall, which selects its platform binary; without it `vite build` dies on a platform mismatch and CI fails the install outright with `ERR_PNPM_IGNORED_BUILDS`. Carries both `allowBuilds` (pnpm 11) and `onlyBuiltDependencies` (pnpm 10, which is what Vercel resolves from the v9 lockfile). If pnpm ever rewrites this file with a `set this to true or false` placeholder, that is a failed install asking to be answered. |
| `package.json` → `engines.node` | `22.x` — pinned to a major on purpose; an open range like `>=22` makes Vercel warn that the build will jump majors on its own. |

`static/schedb.json` is committed, so a clean checkout builds without running
the data pipeline. Refreshing the catalog is `pnpm updateData` followed by a
commit — the deploy just picks up the new file.

## Conventions specific to this repo

- **Section identity is `${dept}|${courseNumber}|${sectionNumber}`, never the CRN.**
  In the older exports 149 CRNs were shared by cross-listed sections and the
  18-digit values exceeded `Number.MAX_SAFE_INTEGER`; the live Workday feed has
  stopped publishing them altogether, so `crn` is a display-only string that is
  now empty. Anything that renders it must tolerate that.
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
- **Term dates live only in `src/lib/config/academicCalendar.ts`.** Nothing else
  in the app knows what day a term starts; the catalog only knows "A Term".
  Rolling to a new academic year is an edit to that one file, gated by
  `tests/calendar/academicCalendar.test.ts`.

## Filtering sections

The funnel beside a course in the Schedules rail opens `FilterMenu`, whose
options come from `buildSectionFilters` in `src/lib/model/sectionFilters.ts`.
Nothing new is stored: an option shows ticked while **any** section it covers is
still switched on, and unticking it calls `AppState.setSectionsDenied` for
exactly that option's sections — one change, one search restart. That is why
switching a professor's last section off by hand also unticks the professor, and
why a group whose options would all cover the same sections is dropped.

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
