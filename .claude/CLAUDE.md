# WPI Planner (Svelte rewrite) — project index

## What this project does

Course schedule planner for WPI. A student picks courses and blocks off times
they are unavailable; the app enumerates every conflict-free combination of
sections and renders them as weekly grids. Fully client-side and static — there
is no server and no API.

This is a ground-up rewrite of the GWT/Java app in `../wpiplanner-master`, which
is deployed at https://planner.wpi.edu/. **Read [`PLAN.md`](PLAN.md) first** —
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

**Picking this up? Read [PLAN.md §11](PLAN.md) — it is the handoff: what
exists, what is left in priority order, and what to know before changing the
search.** §6 has the per-phase gates, §8 lists the four places the rewrite
deliberately departs from the old app, and §10.5 is the one open question that
blocks cutover.

`pnpm test` runs 129 tool tests and 728 app tests.

## Structure

Files that carry the most weight, and what to change where.

### Data pipeline

| Path | What lives there |
|---|---|
| `tools/workday-to-schedb/` | **The converter.** Fetches WPI's Workday feed and turns it into `schedb.json` + `yearHeader.txt`. `pnpm updateData` writes them to `static/` (the committed snapshot); the live endpoint below runs the same code on request. `src/refresh.ts` is the whole fetch → convert → render as one I/O-free function, shared by both. `src/rules.ts` holds the hand-edited catalog quirks, including `INCLUDE_INTEREST_LISTS` (off: WPI's "Interest List" demand placeholders meet at no time and are dropped). Has its own [README](../tools/workday-to-schedb/README.md) and `tests/`. |
| `tools/schedb-to-json/` | The older converter, `.schedb` XML → `static/schedb.json`. Kept for `data/new.schedb`, the export the search was verified against. Its own [README](../tools/schedb-to-json/README.md) and `tests/`. |
| `tools/shared/` | `DescriptionPool` and `AnomalyLog`, used by both converters. |
| `src/lib/model/schedb.ts` | **Single source of truth** for the `schedb.json` shape. Imported by both the app and both converters, so they cannot drift. |
| `src/lib/data/loadCatalog.ts` | Fetches and validates `schedb.json`, reporting byte progress (`onProgress`) and the current step (`onStage`: connecting/downloading/parsing). Takes a `fallbackUrl`: the layout loads `LIVE_CATALOG_URL` (`/api/catalog/schedb.json`) and falls back to the static `CATALOG_URL`. Replaces `Scheduler.java` + `LoadSchedule.java`. |
| `src/lib/data/yearHeader.ts` | The two-line `yearHeader.txt` (academic year, whether to show the `/old` link). `loadYearHeader(fetch, ...urls)` tries live then static the same way. |
| `data/` | `new.schedb`, the pinned February 2025 export, and the generated anomaly report. Not served. |
| `src/lib/model/courseBackground.ts` | Types + validator for **structured prerequisites / recommended background / corequisites / no-credit-with**, read by hand (or agent) out of course descriptions. A `Requirement` tree (`course`, `allOf`, `anyOf`, `countOf`, `topic`, `permission`, `standing`, `other`) per clause, each clause with `strength` (required/recommended/suggested) and `timing` (prior/concurrent/priorOrConcurrent). Also `hashDescription`, `toShippedFile` and the `Shipped*` types (what the browser gets), and **`courseBackgroundStatus(shippedFile, courseId, description)`** → `unchecked` (no entry: a course new since the last read) / `stale` (description changed) / `none` / `hasBackground`. **Features must treat `unchecked` and `stale` as unknown, never as "no prerequisites".** |
| `src/lib/config/courseBackground/<DEPT>.yaml` | **Hand/agent-maintained, YAML for editing.** The extracted data, one file per department (under `src/`, not `data/`, because `/data/` is in `.vercelignore` and the app imports these). **Every catalog course has an entry**, `clauses: []` when it states no background, so "read, none" differs from "never read". Each entry stores the exact description it was read from. Entries for courses that leave the catalog are kept. Never shipped as-is — see `vite/courseBackgroundPlugin.ts`. |
| `vite/courseBackgroundPlugin.ts` | Vite plugin (registered in `vite.config.ts`) that compiles each `courseBackground/<DEPT>.yaml` import: validates it (a bad file fails `pnpm build`/`dev`) and emits `toShippedFile`'s output — descriptions → 8-hex `hashDescription`, `sourceText`/`needsReview` dropped. ~10× smaller than the YAML's data. Tested in `tests/vite/`. Not in `.vercelignore`, since the Vercel build needs it. |
| `src/lib/model/courseBackgroundText.ts` | Entry → display text: `describeRequirement`, `describeRequirementLines` (top-level `allOf` → one line each), `clauseLabel` (Prerequisite / Corequisite / Restriction / Recommended / Suggested), `clauseTimingNote`, and `uncheckedBackgroundNote` (the "prerequisites not checked" warning for `unchecked` / `stale`). |
| `src/lib/data/courseBackground.ts` | `loadCourseBackground(courseId, description)` → `CourseBackgroundStatus`; the Courses tab shows the block only for `hasBackground`, and a "not checked yet" note for `unchecked` / `stale`. Lazy `import.meta.glob`, one chunk per department, cached; a failed load is logged and retried next time. |
| `tools/course-background/` | `pnpm background status` (per department: done / stale / unchecked, over every catalog course), `todo <DEPT>` (courses needing an entry, with descriptions), `check` (validate). Its [README](../tools/course-background/README.md) is the reading guide. Tested by `tests/model/courseBackground.test.ts`, which also validates every stored file. |
| `static/` | Served verbatim, including the generated `schedb.json`. |

### Live catalog endpoint — refresh on request, no cron

The deployed app does not rely on the committed `static/schedb.json` being
current. The first request more than **ten minutes** after the last pull
refetches and reconverts the Workday feed (a few seconds, mostly the download); every other request is
served from the function's memory or from Vercel's CDN (`s-maxage`). The static
files stay as the fallback. `pnpm dev` and `pnpm preview` refresh the same way:
`server/viteCatalogPlugin.ts` mounts the same handler on Vite's server. Details and porting notes: [`server/README.md`](../server/README.md).

| Path | What lives there |
|---|---|
| `server/catalogHandler.ts` | `createCatalogHandler(options)` → Web-standard `(Request) => Response` serving `schedb.json` / `yearHeader.txt` (file from `?file=` or the last path segment). Gzips once per refresh, sets `s-maxage` to the in-memory copy's remaining life, CORS-open. **Host-agnostic — change caching or headers here.** Its `source` option swaps out the Workday fetch. |
| `server/refreshingCache.ts` | Generic value-that-reloads-on-read-after-max-age. Shares concurrent reloads; on a failed reload keeps the old value and retries after 60 s. |
| `server/viteCatalogPlugin.ts` | The local mount: a Vite plugin (registered in `vite.config.ts`) that serves `/api/catalog/*` from the same handler under `pnpm dev` / `pnpm preview`. One handler per process, created on first request. |
| `api/catalog.ts` | The Vercel mount — three lines. `vercel.json` rewrites `/api/catalog/:file` → `/api/catalog?file=:file`. Env `SHOW_OLD_SCHEDULE_LINK=true` sets line 2 of the year header. |
| `api/tsconfig.json` | Read by Vercel's Node builder. `rewriteRelativeImportExtensions` turns the shared code's `./x.ts` imports into `./x.js`; **without it the function deploys but crashes on its first import.** |

### Model — pure data, no DOM, no state

| Path | What lives there |
|---|---|
| `src/lib/model/catalog.ts` | `Catalog`: indexes the JSON by department/course/section id, resolves pooled descriptions, walks section → course → department. Replaces `ScheduleDB`. |
| `src/lib/model/time.ts` | Minutes-since-midnight helpers, 12-hour formatting, and `snapToBlockStart`. |
| `src/lib/model/days.ts` | `DAY_BITS` mask helpers. Also re-exported by the converter. |
| `src/lib/model/terms.ts` | `TermName` parsing, ordering, labels. |
| `src/lib/model/timeGrid.ts` | The `TimeCell` constants and grid math. A test pins the five constants. `NUM_HOURS` is 13, not the legacy 10 — see the two-behaviours note at the bottom of this file. |
| `src/lib/model/availability.ts` | seats/waitlist → `open` / `waitlist` / `full`, per section, per course, per term. |
| `src/lib/model/sectionComponents.ts` | Splits a course's combined sections (`AL01/AX03`) back into lectures and their labs/discussions, plus the tick rules (`sectionsForLectureToggle`, `sectionsForSecondaryToggle`) and `describeMeetings` ("MTRF 10:00-10:50AM"). Stores nothing — a component is on while any section containing it is on. Also `isPlaceholderProfessor` (N/A, Not Assigned, …). |
| `src/lib/model/scheduleTermGroups.ts` | `groupCoursesByScheduledTerm`: the Schedules rail's top-level grouping — chosen courses by the term(s) of their section in the schedule on screen, calendar order, then a trailing `Not on schedule` group. Term labels/sort come from `formatTermSpanLabel` / `termSpanSortKey` in `terms.ts` (shared with `groupEntriesByTerm`). |
| `src/lib/model/catalogSearch.ts` | `CatalogSearch`: the header search's index — classes by code/title, professors by name with the classes they teach. Built once in `AppState`. |

### Scheduling — the algorithm, no DOM

| Path | What lives there |
|---|---|
| `src/lib/scheduling/types.ts` | `GeneratorSection`, `ChosenTimes`, `Problem`, `SchedulePermutation`. All structured-cloneable. |
| `src/lib/scheduling/conflicts.ts` | Pairwise section conflicts and the precomputed index. Replaces `ConflictController`. |
| `src/lib/scheduling/timeConflicts.ts` | Section × chosen-times cells. **Read the header comment before touching it** — the block snapping and the out-of-grid rule are both load-bearing. |
| `src/lib/scheduling/generator.ts` | The DFS, ported closely from `ScheduleProducer`. Also `streamPermutations`, the chunked driver the worker runs. |
| `src/lib/scheduling/scheduleClashes.ts` | `clashingCourseIds` — the cheap check behind the rail's "Clashes" link: a course blocks a row when every one of its *baseline* options clashes with it (see `AppState.fixBaselines`). Uses the existing `ConflictIndex`; no searching. |
| `src/lib/scheduling/fixFinder.ts` | **The fix search.** `findFixes(request)`: pins the clicked component, lets every other course take any section (checked or not, never a blocked time) and returns the least disruptive full schedules, up to 3 per tier. Tiers: 1 same lecture profs & terms → 2 new prof → 3 term move → 4 both; then fewest new profs → term moves → courses moved → time shift → unchecked sections. Branch-and-bound with forward checking, a precomputed clash table and fewest-options-first ordering, stopped by `maxMillis` (a time-out with nothing found is reason `timed-out`, never "no combination"); **read the header comment before changing the ranking or the bound** — `tests/scheduling/fixes/fixFinder.test.ts` checks it against brute force. |
| `src/lib/scheduling/fixCandidates.ts` | Catalog → `FixRequest`: each candidate's `ChangeCost` (moved, lecture-prof change, term move, time shift, unchecked) against its `nearestBaseline` — the course's on-screen section, or with no schedule the closest checked section (same lecturer, then same terms, then time). The pinned course is charged only for parts that come with the pick. |
| `src/lib/scheduling/fixDescription.ts` | Fix → panel wording, all plain text, and **tags name only changes** (nothing about what stays, nothing about unchecked sections — "Use this" re-checks them): headline tags `(1 new prof) (1 term change) (2 courses move)`, one line per course `CS1102 (New prof: Donald Knuth, was Grace Hopper) (Moves to B-Term)`, change lines `Lecture  TR 10am - 10:50am AL01 → MWF 1pm - 1:50pm AL03` (times, then section name), lab/discussion instructor notes by full name, "makes room for X" cascade order, folding past 3 courses. Also the panel header, the no-fix reason, and `splitBestPerTier`. |
| `src/lib/scheduling/problems.ts` | Conflict-resolver suggestions: construction, equality, text, and applying one. |
| `src/lib/scheduling/referenceGenerator.ts` | Brute-force oracle. **Tests only** — exponential, no pruning. |
| `src/lib/scheduling/worker/` | `protocol.ts` (message types), `generator.worker.ts` (runs the search off-thread), `client.ts` (typed wrapper, with a synchronous fallback). `fixFinder.worker.ts` + `fixFinderClient.ts`: the same for the fix search (one request, one result; superseded results dropped). **`cancel()` terminates a busy worker** — the search is one synchronous call, so that is the only way closing the panel can stop it. |

### Calendar export — dates, no DOM

| Path | What lives there |
|---|---|
| `src/lib/config/academicCalendar.ts` | **Hand-maintained.** Term start/end dates, no-class days, "follow X schedule" days, and breaks. None of this is in the Workday export, so it is transcribed from the Registrar's calendar and must be redone every academic year — the rollover steps are in `updating.md`. |
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
| `src/lib/state/app.svelte.ts` | `AppState`, put into context by the layout. Owns the one cross-cutting rule: **a change to the choices calls `refresh()`, which restarts the search.** Start here. `importEnrolledSections` applies a Workday import: it replaces the selection and denies every section but the registered one. `showCourse` is the header search's "open": it switches the department picker to that course's department **alone** (replacing, not adding) and asks the picker to scroll it into view (`coursesView.pendingDepartmentReveal`). |
| `src/lib/state/selection.svelte.ts` | Chosen courses and denied sections; the 18-course limit. Replaces `StudentSchedule`'s course half plus every `SectionProducer`. |
| `src/lib/state/chosenTimes.svelte.ts` | The per-term availability grid and its drag semantics. |
| `src/lib/state/favorites.svelte.ts` | Starred schedules, stored as section ids plus a student-editable name (`Favorite N` by default). Lookup, rename, and removal all match on the section *set*, so a regenerated schedule keeps its name. |
| `src/lib/state/permutations.svelte.ts` | Drives the worker, holds results and the selected schedule, and the 17-colour palette. |
| `src/lib/state/timeRange.svelte.ts` | The hours the grids show. |
| `src/lib/state/coursesView.svelte.ts` | `CoursesViewState`: the Courses tab's dragged pane sizes, its three scroll offsets (departments, course table, chosen list), and which course the table last scrolled to. On `AppState` so a tab switch keeps them; not persisted. |
| `src/lib/state/railView.svelte.ts` | `RailViewState`: which Schedules-rail courses are expanded and the rail's scroll offset. On `AppState` (not the page) so both survive switching tabs; not persisted, so a fresh visit starts all collapsed. |
| `src/lib/state/fixPanel.svelte.ts` | `FixPanelState`: the row the fix panel is open for, search status/result, the hover preview, the time limits (`QUICK_SEARCH_MS` 1 s; `searchLonger()` re-asks with `LONG_SEARCH_MS` 30 s), and a per-row cache cleared by `AppState.refresh()` (which also closes the panel). `AppState.selectSchedule` closes it too, since fixes are measured against the schedule on screen. |
| `src/lib/state/persistence.ts` | All `localStorage` reads and writes. Every function is total: a corrupt payload yields the default. |

### Routes and components

| Path | What lives there |
|---|---|
| `src/routes/+layout.ts` | Route options only — no data loading. `ssr = false`, `prerender = true`, `trailingSlash = 'always'`. |
| `src/routes/+layout.svelte` | Boot sequence: renders `LoadingScreen` first, then fetches the catalog and year header after mount, then mounts `AppShell`. Owns the load error + retry. |
| `src/routes/{courses,info,times,schedules}/+page.svelte` | One route per tab, in `TabList.addTab` order. `courses` auto-sizes the "Courses" box and flies "+" into it. `schedules` renders the Workday import alone when no course has been chosen. |
| `src/lib/components/shell/` | `AppShell` (creates `AppState`, applies a `?share=` link, renders header + search + tabs + the route body), `AppHeader` (takes `search` and `tabs` snippets), `TabBar` (**Times is dimmed until a course is chosen; Schedules is not** — with nothing chosen it shows the Workday import on its own), `LoadingScreen` (the plain white "Loading scheduler database..." page with the byte counter). |
| `src/lib/components/search/` | `HeaderSearch` (the box in the crimson bar and the filleted crimson panel that drops from it; live, 250 ms open), `SearchResults` (the Classes and Professors boxes), `SearchResultCourse` (one row: add/remove button, opens the course on the Courses tab). |
| `src/lib/ui/` | DOM helpers with no app knowledge: `flyToTarget` (animates a copy of an element onto another — "+" flying into the Courses box), `rememberScroll` (an action that restores an element's scroll offset from a store and records it back — how both tabs keep their scroll across tab switches), `placePopover` (where a popover opened at a point goes so it stays on screen), `HoverIntent` in `hoverIntent.ts` (open-after-rest / close-after-grace timing for a popover the pointer must be able to reach), `stableReorder` (FLIP + scroll anchoring: hold one item still on screen while a list regroups, sliding the rest; adds bottom slack when a short list cannot scroll far enough), and `fitPaneSize` (how tall the Courses box should be — fit the list, never crowd the description — and how wide the Schedules rail should be so the calendar is square). |
| `src/lib/components/primitives/` | `SplitPane`, `ScrollArea`, `Modal`, `Popover` (floating box at a point, kept on screen, stays until Escape or a press outside that is not on a `data-popover-trigger`), `ToggleButton`, `WarningIcon`. Generic, no app knowledge. |
| `src/lib/components/catalog/` | The Courses tab: `DepartmentPicker` (the six academic groups live here), `CourseTable`, `CourseRow`, `TermBadges`, `CourseDetails` (loads the course's background after the description; a course not yet read gets a "prerequisites have not been checked" note instead), `CourseBackground` (the "Background" block: one labelled line or bullet list per clause, plus "No credit for both"), `SelectedCourseList`. |
| `src/lib/components/times/` | `TermTimeTabs`, `TimeGrid`, `TimeGridCell`. |
| `src/lib/components/schedules/` | `SchedulePane` (the view-mode switch), `SectionPicker` (the rail — see "The section rail" below), `CourseComponentList` (one course: each lecture with its own labs/discussions nested under it), `ComponentRow` (one single-line row), `TermDivider` (the ──── A-Term ──── rule, used in the rail and inside a course; `muted` = dashed "Not on schedule"), `ScheduleThumbnailList` / `ScheduleThumbnail` (canvas), `FavoriteNameField` (click-to-edit favourite name, used by both the toolbar and the strip), `QuarterGrid`, `WeekGrid`, `WeekGridColumn`, `PeriodBlock`, `DetailedView`, `SectionDetailsDialog`, `ConflictResolver`, `GenerationProgress` (canvas), `ShareLink`, `CalendarExport` (the third toolbar view, "Export to Calendar"), `WorkdayImport` (the fourth toolbar view: the step-by-step instructions, the file picker, and the review dialog — it overrides the progress/conflict-resolver state so it stays reachable with no schedule on screen), `FixPanel` / `FixCard` (the "how could I take this?" popover at the cursor — see "The section rail"), `WorkdayInstructions` (the six steps for producing the export, including a drawn SVG of Workday's whole top-right icon bank with the unlabelled export button circled). |
| `src/lib/styles/` | `tokens.css` (every colour and size lifted from the old app) and `reset.css`. |
| `src/lib/share/shareCode.ts` | Encode/decode `?share=`. Version-prefixed. Writes v3 (`3.CS2102-BL01.BX01_MA1021-A01`: only characters a query never percent-encodes, `~XX` escapes for the rare odd character); still reads v2 (`02.` + raw ids joined by `~`) so links already shared keep working. Old hex-CRN links are rejected, not migrated. **The header comment is the format spec.** `tests/share/shareCodeRealCatalog.test.ts` round-trips every id in `static/schedb.json`. |

### Tests

`tests/` mirrors `src/lib/` (`tests/ui/` covers `src/lib/ui/`), plus `tests/server/` for the live endpoint
(handler headers, the ten-minute window, stale-on-failure). Two suites matter more than the rest:

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

## Maintenance guide

[`updating.md`](../updating.md) (linked from `readme.md`) is the one place for
everything maintained by hand, each in a `<details>` dropdown: course
background (`pnpm background`), the fallback catalog, the academic calendar,
the converter's department and special-topics lists, and the old-planner link.
**When a hand-maintained part is added or its steps change, update that file**,
not a comment at the bottom of the source file.

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
pnpm background status # course-background progress; also `todo <DEPT>`, `check`

tools/parity-oracle/run.sh data/new.schedb CS2102,MA1021   # legacy search, needs a JDK
```

## Deployment (Vercel)

The site is a static bundle — `adapter-static` writes `build/` and Vercel serves
those files directly. The one server function is `api/catalog.ts`, the live
catalog endpoint described above.

| File | What it does |
|---|---|
| `vercel.json` | `framework: null` so Vercel does **not** apply its SvelteKit preset (that preset expects `adapter-vercel` and looks in `.vercel/output`). It runs `pnpm run build` and serves `build/` as plain files. `trailingSlash: true` matches `trailingSlash = 'always'` in `src/routes/+layout.ts`. Cache headers: `_app/immutable/*` forever, `schedb.json` and `yearHeader.txt` never — those two are replaced by `pnpm updateData` and must not be served stale. Also declares `api/catalog.ts` (30 s max) and the `/api/catalog/:file` rewrite; the endpoint sets its own cache headers. |
| `.vercelignore` | Keeps `data/`, `tests/`, and most of `tools/` out of the upload — but **not** `tools/workday-to-schedb/src` or `tools/shared`, which the live endpoint imports. **Every pattern must be anchored with a leading `/`** — an unanchored `data/` also matches `src/lib/data/` and silently strips `loadCatalog.ts` from the deploy. |
| `pnpm-workspace.yaml` | Approves esbuild's postinstall, which selects its platform binary; without it `vite build` dies on a platform mismatch and CI fails the install outright with `ERR_PNPM_IGNORED_BUILDS`. Carries both `allowBuilds` (pnpm 11) and `onlyBuiltDependencies` (pnpm 10, which is what Vercel resolves from the v9 lockfile). If pnpm ever rewrites this file with a `set this to true or false` placeholder, that is a failed install asking to be answered. |
| `package.json` → `engines.node` | `22.x` — pinned to a major on purpose; an open range like `>=22` makes Vercel warn that the build will jump majors on its own. |

`static/schedb.json` is committed, so a clean checkout builds without running
the data pipeline. In production the app reads the live endpoint
(`api/catalog.ts`, above) and only falls back to that file, so `pnpm updateData`
+ commit is now needed only to keep the fallback and local dev reasonably
current — not to publish new seat counts.

`vercel build` works locally to inspect the compiled function: put
`{"projectId":"x","orgId":"y","settings":{"framework":null}}` in
`.vercel/project.json` (gitignored) and look under
`.vercel/output/functions/api/catalog.func/`.

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

## The section rail

The Schedules rail lists each course's **lectures**, and under every ticked
lecture the labs and discussions that can be taken with it
(`buildLectureEntries` in `src/lib/model/sectionComponents.ts`). A professor who
teaches two lectures appears twice, each with that lecture's labs; unticking a
lecture folds its labs away. This replaced both the flat list of combined
`AL01/AX03` sections and the professor funnel filter.

Nothing new is stored: a row is ticked while **any** combined section containing
it is still on, and every tick calls `AppState.setSectionsDenied` once — one
change, one search restart. A nested lab toggles only its pairing with *that*
lecture, and turning it on skips sibling discussions the student switched off
(`sectionsForLinkedToggle`).

Every course starts **collapsed**; what the student opens, and how far they
scrolled, lives in `AppState.railView` so it is still there after visiting
another tab (`ScrollArea`'s bindable `scrollTop`, via `rememberScroll`). The Courses tab
keeps its scroll and dragged pane sizes the same way, in `AppState.coursesView`.

**Courses** are grouped the same way one level up, by where the schedule on
screen puts them (`groupCoursesByScheduledTerm`, labelled "Currently In A-Term:"), with courses it leaves out
under a muted, dashed "Not on schedule" divider at the bottom. The rail is one
flat keyed `#each` of dividers and courses, so a regrouped course keeps its DOM
node. On a regroup `SectionPicker` holds the last-pressed course (else an open
one) still on screen via `ui/stableReorder.ts` and slides the rest; the page
passes `placementSectionIds`, the last schedule held while a search restarts,
so the grouping does not flash to "Not on schedule" on every change.

Lectures are grouped under a thin "──── A-Term ────" divider per term
(`groupEntriesByTerm`), in calendar order, with a semester-long lecture's group
("A-Term – B-Term") between its two terms. A course that runs in one term gets
no divider.

**Baselines** (`AppState.fixBaselines`): what counts as "no change" for each
course — its section in the schedule on screen, or, when the search found no
schedule at all, every checked section that fits the Times tab. The clash links
and the fix panel both work from these, so they keep working when nothing fits.

A row that does not fit the baselines ends in a plain underlined "Clashes"
link — one word, so it barely narrows the professor column; which courses it
clashes with is in its aria-label and the popover (its own rail column, between
professor and times, empty otherwise; labs under a clashing lecture don't
repeat it). The check is cheap (`scheduleClashes.ts`). It opens the **fix
panel**, a popover at the pointer (`Popover` → `FixPanel` → `FixCard`,
`ui/placePopover.ts`), two ways (`hoverFixes` / `clickFixes` in the Schedules
page): **mouse hover** opens it after 300 ms and closes it 300 ms after the
pointer leaves link and popover (`ui/hoverIntent.ts`); **click or tap** opens
it *pinned* — it stays until the same link is clicked again, a press outside,
Escape, or ✕ — and clicking a hover-opened one pins it. Touch never triggers
hover (the link checks `pointerType`), and hovering other links leaves a
pinned popover alone. The link carries `data-popover-trigger` so its own press
is not counted as "outside". Only
then is anything solved: `AppState.openFixPanel` builds the
request, `FixPanelState` runs it in a worker and caches the answer until the
choices change. The first search gets one second; if it finds nothing in that time the panel
says "No viable suggestions found." with a "Search longer" button (noting there
will likely be no results), and closing the popover stops either search. The
panel shows the best fix of each tier, the rest behind
"More options"; hovering a card previews it on the calendar
(`fixPanel.previewSectionIds`), "Use this" (`AppState.applyFix`) re-checks any
unchecked sections it needs and puts that schedule on screen directly, even if
it is past the 300 kept. Everything is plain text, no colour — by request.

Hovering a row previews a whole combined section, so the rail picks the one
closest to the course's scheduled section (`closestSection`): hovering another
discussion moves only the discussion on the grid, not the lab.

Every row is one line — label, professor, times — and the rail is a single CSS
grid whose rows are subgrids (`SectionPicker` → `CourseComponentList` →
`ComponentRow`), so the columns line up across courses; a long professor name
ends in "…". The rail's default width is whatever leaves the calendar square
(`railWidthForSquareCalendar` in `src/lib/ui/fitPaneSize.ts`), recomputed on
window resize.

## Two behaviours that look like bugs and are not

- **A course whose sections are all switched off drops out of the search
  entirely**, rather than making the schedule impossible. The legacy producer
  skipped empty section lists the same way. This is why adding a fully-closed
  course such as CS1004 changes nothing.
- **Cells outside the chosen-times grid count as blocked, so weekend and
  before-8:00AM sections are never schedulable.** The grid covers Monday–Friday,
  8:00AM–9:00PM (`src/lib/model/timeGrid.ts`), and a cell outside it can never be
  selected. The legacy grid stopped at 6:00PM, which made this rule delete every
  evening section from the search while the schedule grids still drew the 7:00PM
  and 8:00PM rows — widening it to 9:00PM (past the catalog's latest meeting,
  8:50PM) is the fix, and it is the one deliberate behavioural break with the GWT
  producer. The legacy NPE on weekend sections is also fixed: they are ordinary
  conflicts. Conflict cells carry `insideGrid`, and the resolver must not offer to
  re-enable one that is false.
