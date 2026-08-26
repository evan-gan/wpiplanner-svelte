# WPI Planner — GWT → Svelte rewrite plan

**Source:** `../wpiplanner-master` — GWT 2.x, 87 Java files, ~7,700 LOC, compiled to
static JS in `war/scheduler/`.
**Target:** SvelteKit 2 + Svelte 5 + TypeScript, `adapter-static`, no server.

Two rules govern every decision below:

1. **On the surface it looks and behaves like the old app.** Same tabs, same
   layout, same colors, same interactions, same terminology. Every ported
   behavior gets checked against the running old app.
2. **Underneath it is modular.** Where the old app has a 300-line widget doing
   layout, data access, and business logic at once, the rewrite splits it. Where
   the old app already has a clean seam (the model classes, the DFS generator),
   the port stays faithful.

Compatibility with old share links and old `localStorage` is **not** required.

---

## 1. What the audit found

Facts established by reading the source and the February 2025 export. These drive
several decisions, so they are recorded here rather than rediscovered later.

### The data

| | |
|---|---|
| `war/new.schedb` | 8.2 MB XML, attribute-only, no mixed content |
| Contents | 73 departments, 1,233 courses, 5,565 sections, 11,823 periods |
| Elements | `schedb > dept > course > section > period` |
| Period types | `Lecture, Lab, Discussion, Workshop, Seminar, Experiential, Independent Study, Internship, Thesis` |
| `part-of-term` values | `A Term`, `B Term`, `C Term`, `D Term`, `A Term, B Term`, `C Term, D Term` — nothing else |
| `days` values | comma lists of `sun..sat`, plus `?` on 489 periods |
| `building` | **always empty**; the full location lives in `room` |
| Unused by the app | `professor_email`, `professor_sort_name`, `term` (duplicate of `part-of-term`), `min-credits`, `max-credits` |

### Five things that shape the rewrite

1. **CRNs are not unique.** 149 CRNs are shared by two sections — cross-listed
   courses (`AR|2101|A01` = `IMGD|2101|A01`). The old `ScheduleDB.getSectionByCRN`
   returns the first match, so share links and favorites resolve cross-listed
   courses into whichever department parsed first. Since share-link
   compatibility is not required, the rewrite keys sections on
   `${dept}|${courseNumber}|${sectionNumber}`, which **is** unique across all
   5,565 sections.
2. **CRNs exceed `Number.MAX_SAFE_INTEGER`** (max observed 338710338711322494).
   They are `long` in Java and must be `string` in TypeScript. A naive
   `Number(crn)` port loses precision silently.
3. **Descriptions are 4.0 MB of near-total duplication** — every section repeats
   its course's catalog blurb. Pooling collapses this to 0.86 MB.
4. **`ScheduleProducer.maxSolutions` is 0 for the main producer.** The normal
   generator therefore never builds "solutions"; only `ConflictResolverWidget`
   spins up a second producer with `maxSolutions` escalating 1→10 when zero
   schedules exist. This is deliberate, not a bug — port both paths.
5. **The schedule grid is DOM tables, not canvas.** Canvas is used only for the
   permutation *thumbnails* (`PermutationCanvasList`) and the progress spinner
   (`CanvasProgress`). That is a much smaller canvas surface than a first glance
   at the imports suggests.

### Latent bugs in the old app, and what to do about each

| Bug | Decision |
|---|---|
| `getSectionByCRN` picks the wrong cross-listed section | **Fix** — section ids are unique |
| `Time("12:00AM")` yields hour 12, not 0 | **Fix** — `parseClockTime` follows the clock, logs an anomaly |
| `hasAvailableSeatsForTerm` uses `term.substring(8).charAt(0)` — only works for exactly two terms in a fixed format, relies on GWT's out-of-range `substring` returning `""` | **Fix** — sections carry a parsed `terms: TermName[]` |
| `loadSchedule` uses a thrown NPE as control flow to detect a missing `?share=` param | **Fix** — plain null check |
| `ConflictController.generate()` calls `sectionQueue.remove(0)` without an empty check; re-arming the timer on `addCourse` can hit an empty queue | **Fix** — guard, and move the whole thing off timer-slicing |
| `location = building + room` with an always-empty `building` yields a trailing space | **Fix** — collapse and trim |
| `getTimeConflicts` looks up cells the chosen-times grid does not contain. The grid is Mon–Fri 8:00–18:00, so an evening section found its times missing from the chosen list and was dropped from **every** schedule, and a weekend section hit `HashMap.get` returning null and threw an NPE inside the search | **Keep the exclusion, fix the crash** — decided by the maintainer (§10.5). Cells outside the grid count as blocked, so students see the same schedules as today; a weekend section is now an ordinary conflict rather than an NPE. The resolver labels an out-of-grid block as one it cannot re-enable |
| Hard limit of 18 courses via `Window.alert` | **Keep** the limit (the color palette has 17 entries), replace the alert with inline UI |

---

## 2. Stack decisions

| Choice | Why |
|---|---|
| **SvelteKit 2 + `adapter-static`** | The app is already fully static. SvelteKit gives routing (one route per tab, which the old app faked with a `TabList` + `SimplePanel` swap), prerendering, and a build pipeline, then emits plain files for `planner.wpi.edu`. |
| **Svelte 5 runes** (`$state`, `$derived`, `$effect`) | Direct replacement for `HandlerManager` + 7 event/handler classes. Fine-grained reactivity means the schedule grid re-renders only what changed. |
| **TypeScript, `strict`** | The Java model is strongly typed; losing that in the port would be a downgrade. |
| **Build-time XML → JSON** (`tools/schedb-to-json`) | ~20 ms `JSON.parse` vs building an XML DOM and object graph on the main thread. Already built and tested — see §4. |
| **Web Worker for permutation generation** | The old app timer-slices the DFS in 30-step chunks on the main thread to avoid freezing. A worker removes the slicing entirely and lets the search run flat out. |
| **Plain CSS with custom properties** | The old look is a small, fixed design. Tokens in one file, component styles colocated in `.svelte` files. No framework needed. |
| **`vitest`** for app code, **`node --test`** for tools | Tools run under Node's native type stripping with no install; app code needs the Vite pipeline anyway. |

**Not chosen:** a UI component library (the look is bespoke and small), a state
library (runes cover it), IndexedDB (the catalog re-fetches in ~20 ms; caching
adds a staleness problem for no gain).

---

## 3. Project structure

Every file, with what it does. `←` marks files that already exist.

**All of the paths below now exist**, with three additions the original plan did
not anticipate, each noted inline: `lib/state/app.svelte.ts`,
`lib/scheduling/worker/protocol.ts`, and `tests/fixtures/`.

```
wpiplanner-svelte/
├── PLAN.md                                 ← this document
├── package.json                            ← scripts: dev/build/test/data:build
├── tsconfig.json                           ←
├── svelte.config.js                          adapter-static, prerender all
├── vite.config.ts                            worker format, vitest config
├── .gitignore                                node_modules, .svelte-kit, build, data/*.schedb
├── .claude/CLAUDE.md                       ← project index (kept current)
│
├── data/                                     build inputs & reports, not shipped
│   ├── new.schedb                          ← the Workday export (git-ignored; large)
│   └── schedb-report.json                  ← generated anomaly log
│
├── static/                                   served verbatim
│   ├── favicon.ico                           copied from war/
│   ├── schedb.json                         ← generated catalog (4.69 MB, 0.41 MB gzip)
│   └── yearHeader.txt                        copied from war/ — line 1 year, line 2 show-old-link
│
├── tools/schedb-to-json/                   ← BUILT AND TESTED — see §4
│
├── src/
│   ├── app.html                              shell; #loading placeholder replaced on hydrate
│   ├── app.css                               imports tokens + reset
│   │
│   ├── routes/
│   │   ├── +layout.ts                        ssr=false, prerender=true; loads catalog + yearHeader
│   │   ├── +layout.svelte                    AppHeader + TabBar + <slot/>; owns the app-level stores
│   │   ├── +page.ts                          redirect → /courses (old app opens on Courses)
│   │   ├── courses/+page.svelte               "Courses" tab
│   │   ├── info/+page.svelte                  "Info" tab (old WelcomeView content)
│   │   ├── times/+page.svelte                 "Times" tab
│   │   └── schedules/+page.svelte             "Schedules" tab
│   │                                          tab order matches TabList.addTab:
│   │                                          Courses, Info, Times, Schedules
│   │
│   └── lib/
│       ├── model/                            pure data — no DOM, no state, trivially testable
│       │   ├── schedb.ts                   ← wire-format types; single source of truth
│       │   ├── catalog.ts                    Catalog class: indexes schedb.json by
│       │   │                                 department/course/section id; resolves description
│       │   │                                 indices; replaces ScheduleDB
│       │   ├── time.ts                       minutes-since-midnight helpers, formatting
│       │   ├── days.ts                       DAY_BITS mask helpers (shared with the tool)
│       │   ├── terms.ts                      TermName helpers, ordering, labels
│       │   ├── timeGrid.ts                   TimeCell → grid math (START_DAY/HOUR, CELLS_PER_HOUR)
│       │   └── availability.ts               seat/waitlist → 'open' | 'waitlist' | 'full',
│       │                                     per course, section, and term
│       │
│       ├── data/
│       │   ├── loadCatalog.ts                fetch schedb.json with byte-progress, validate
│       │   │                                 formatVersion, build Catalog
│       │   └── yearHeader.ts                 fetch + parse yearHeader.txt
│       │
│       ├── state/                            runes-based app state; one concern per file
│       │   ├── app.svelte.ts                  ADDED — the container the layout puts in context;
│       │   │                                  owns the one rule that links the others: a change
│       │   │                                  to the choices restarts the schedule search
│       │   ├── selection.svelte.ts           chosen courses + denied sections (SectionProducer +
│       │   │                                 StudentSchedule course half)
│       │   ├── chosenTimes.svelte.ts         per-term time grid (StudentChosenTimes/TermTimes)
│       │   ├── favorites.svelte.ts           favorited permutations, each with a name
│       │   ├── permutations.svelte.ts        drives the worker, holds results + selection
│       │   ├── timeRange.svelte.ts           derived visible start/end hour for the grids
│       │   └── persistence.ts                localStorage read/write for all of the above
│       │
│       ├── scheduling/                       the algorithm — ported closely, no DOM
│       │   ├── types.ts                      SchedulePermutation, SearchState
│       │   ├── conflicts.ts                  pairwise section conflict index (ConflictController)
│       │   ├── generator.ts                  DFS permutation search (ScheduleProducer)
│       │   ├── timeConflicts.ts              section × chosen-times conflict cells
│       │   ├── problems.ts                   ConflictProblem / TimeConflictProblem
│       │   ├── referenceGenerator.ts         brute-force oracle used only by tests (§7)
│       │   └── worker/
│       │       ├── protocol.ts                ADDED — the request/response message types, shared
│       │       │                              by both sides so they cannot drift
│       │       ├── generator.worker.ts       runs conflicts.ts + generator.ts off-thread
│       │       └── client.ts                 typed postMessage wrapper, with a synchronous
│       │                                      fallback for when Worker is unavailable
│       │
│       ├── share/
│       │   └── shareCode.ts                  encode/decode ?share= from section ids
│       │
│       ├── styles/
│       │   ├── tokens.css                    WPI crimson #c41230, term colors, spacing, type
│       │   └── reset.css
│       │
│       └── components/
│           ├── shell/
│           │   ├── AppHeader.svelte          crimson bar: "Planner", year, refresh timestamp,
│           │   │                             optional old-schedule link
│           │   └── TabBar.svelte             the four tab buttons, active styling
│           │
│           ├── primitives/                   generic, reusable, no app knowledge
│           │   ├── SplitPane.svelte          draggable split (replaces SplitLayoutPanel)
│           │   ├── ScrollArea.svelte
│           │   ├── Modal.svelte              replaces DialogBox + glass panel
│           │   ├── ToggleButton.svelte
│           │   ├── FilterMenu.svelte         funnel button -> popover of tick-box filter groups
│           │   └── WarningIcon.svelte        ⚠ red (full) / blue (waitlist), with tooltip
│           │
│           ├── catalog/
│           │   ├── DepartmentPicker.svelte   multi-select grouped by academic area
│           │   ├── CourseTable.svelte        the course list for selected departments
│           │   ├── CourseRow.svelte          one course: term badges, warning icon, name
│           │   ├── TermBadges.svelte         the A/B/C/D colored squares
│           │   ├── CourseDetails.svelte      title, description, professors, seats
│           │   └── SelectedCourseList.svelte the "Courses" box of picked courses
│           │
│           ├── times/
│           │   ├── TermTimeTabs.svelte       A/B/C/D grid switcher
│           │   ├── TimeGrid.svelte           drag-select availability grid
│           │   └── TimeGridCell.svelte
│           │
│           └── schedules/
│               ├── SchedulePane.svelte       view-mode switch: grid / detail / progress / conflict
│               ├── SectionPicker.svelte      per-course section & term checkboxes (left rail),
│               │                             with the per-course section filter menu
│               ├── ScheduleThumbnailList.svelte  the scrollable strip of mini schedules
│               ├── ScheduleThumbnail.svelte  one mini schedule (canvas)
│               ├── QuarterGrid.svelte        2×2 A/B/C/D week grids
│               ├── WeekGrid.svelte           one week: time axis + day columns
│               ├── WeekGridColumn.svelte     one day column, lays out overlapping blocks
│               ├── PeriodBlock.svelte        one class block
│               ├── DetailedView.svelte       the text/detail listing
│               ├── SectionDetailsDialog.svelte  period description modal
│               ├── ConflictResolver.svelte   "no schedules found" + suggested fixes
│               ├── GenerationProgress.svelte progress indicator while searching
│               └── ShareLink.svelte          the copyable ?share= URL
│
└── tests/                                    app tests; `pnpm test` runs these + tools
    ├── fixtures/                             ADDED — miniCatalog.ts (a 3-course catalog) and
    │                                          generatorFixtures.ts (readable section builders)
    ├── model/{time,days,terms,timeGrid,availability,catalog}.test.ts
    ├── data/{loadCatalog,realCatalog}.test.ts  fetch/validate, and the Phase 1 count gate
    ├── scheduling/{conflicts,generator,timeConflicts,problems,workerClient}.test.ts
    ├── scheduling/generator.parity.test.ts   fast generator vs brute-force oracle
    ├── scheduling/goldenSets.test.ts         real course sets from the catalog
    ├── state/{app,selection,chosenTimes,favorites,timeRange,permutations,persistence}.test.ts
    └── share/shareCode.test.ts
```

---

## 4. The XML → JSON mapper (done)

Built, tested, and run against the real export. See
[`tools/schedb-to-json/README.md`](tools/schedb-to-json/README.md) for full detail.

```
$ pnpm run data:build
Wrote static/schedb.json
  73 departments, 1233 courses, 5565 sections, 11823 periods
  8.20MB XML -> 4.69MB JSON (42.9% smaller)
  1252 pooled descriptions (0.86MB)
  anomalies: unknown-days=489, zero-length-period=488, duplicate-crn=159

$ pnpm run test:tools
# tests 62
# pass 62
# fail 0
```

Gzipped: 0.52 MB → 0.41 MB. Parse: ~168 ms scan+map vs **~20 ms `JSON.parse`**.

Format decisions, each with a reason:

| Decision | Reason |
|---|---|
| Times as **minutes since midnight** | Integer compare/sort/subtract; removes the `Time.compareTo` surface entirely |
| Days as a **7-bit mask** | Overlap test becomes `(a & b) !== 0` in the DFS inner loop |
| Descriptions **pooled** into a shared array | 4.0 MB → 0.86 MB |
| Sections carry an explicit **`id`**, CRN is display-only `string` | CRNs are neither unique nor safe as JS numbers |
| `terms: TermName[]` alongside the raw `termLabel` | Kills the `substring(8)` hack |
| Structural problems **throw**, data oddities go to an **anomaly report** | A changed upstream format fails the build loudly; 489 `days="?"` rows do not |

**Optional later lever:** the 4.69 MB is now mostly repeated JSON key names.
A columnar or short-key encoding would cut it to ~1.5 MB raw, but gzip already
recovers most of that (0.41 MB on the wire) and readability during the rewrite
is worth more. Revisit only if parse time becomes a problem, which at 20 ms it
is not.

---

## 5. Parity ledger — every old file, and where it goes

This is the checklist. Every row below now has an implementation at the path it
names, but nothing is "ported" until its row is verified against the running old
app, and that pass has not been done.

### Entry point and shell

| Old | New | Notes |
|---|---|---|
| `client/Scheduler.java` | `routes/+layout.ts`, `lib/data/loadCatalog.ts` | Static `ScheduleDB` singleton → catalog passed through `load` |
| `client/LoadSchedule.java` | `lib/data/loadCatalog.ts` | XHR progress events → `fetch` + `ReadableStream` byte counting |
| `client/SchedXMLParser.java` | **deleted** | Replaced by `tools/schedb-to-json` |
| `client/SchedJSONParser.java` | **deleted** | Live fallback in the old app: `LoadSchedule` tries XML, then JSON. Both paths collapse into the build-time mapper |
| `client/MainView.java` + `.ui.xml` | `routes/+layout.svelte`, `components/shell/AppHeader.svelte` | `DockLayoutPanel` pixel sizes → flex/grid |
| `client/tabs/TabList.java` + `.ui.xml` | `components/shell/TabBar.svelte` | Body swapping → SvelteKit routes; `sched-TopButton*` classes preserved |
| `client/tabs/BaseTab.java` | **deleted** | Tab enable/disable becomes a `$derived` on the route link |
| `client/Resources.java` | **deleted** | `ClientBundle` → Vite asset import |
| `client/IncomingAnimation.java`, `courseselection/CourseAddAnimation.java` | Svelte `transition:` directives | |
| `client/ProgressEvent.java` | folded into `loadCatalog.ts` | |
| `war/Scheduler.css` | `lib/styles/tokens.css` + colocated component styles | Split by concern; shared values become custom properties |
| `war/index.html` | `src/app.html` | |

### Model

| Old | New | Notes |
|---|---|---|
| `shared/model/ScheduleDB.java` | `lib/model/catalog.ts` | `getSectionByCRN` → `getSectionById` (see §1) |
| `Department/Course/Section/Period.java` | `lib/model/schedb.ts` (data) + `catalog.ts` (lookups) | Parent back-references (`section.course`) become id lookups, so the JSON stays a tree and is structured-cloneable into the worker |
| `Time.java` | `lib/model/time.ts` | Class → integer + pure functions |
| `DayOfWeek.java` | `lib/model/days.ts` | Enum → bit mask |
| `Term.java` | `lib/model/terms.ts` | |
| `PeriodType.java` | **deleted** | Already unused — the parser stores the raw string, and 4 of the 9 live values are not in the enum |
| `TimeCell.java` | `lib/model/timeGrid.ts` | Constants preserved verbatim: `START_DAY=1, START_HOUR=8, CELLS_PER_HOUR=2, NUM_DAYS=5, NUM_HOURS=10` |
| `Course.hasAvailableSeats*`, `Section.hasAvailableSats` (sic) | `lib/model/availability.ts` | One place, three levels (course/section/term), typo fixed |

### Controllers → state

| Old | New | Notes |
|---|---|---|
| `controller/StudentSchedule.java` | `state/selection.svelte.ts`, `state/timeRange.svelte.ts`, `state/favorites.svelte.ts` | The old class is three concerns in one; split them |
| `controller/SectionProducer.java` | `state/selection.svelte.ts` | Denied-section logic per course |
| `controller/StudentChosenTimes.java`, `StudentTermTimes.java` | `state/chosenTimes.svelte.ts` | JSNI `JavaScriptObject` overlays → plain objects |
| `controller/ConflictController.java` | `scheduling/conflicts.ts` | Timer-sliced generation → computed in the worker |
| `controller/SchedulePermutation.java` | `scheduling/types.ts` | |
| `controller/HasCourse.java` | **deleted** | Sorting interface, unnecessary in TS |
| `StudentScheduleEvent(s)/Handler`, `FavoriteEvent/Handler`, `CourseSelectedEvent/Handler`, `TimeRangeChangeEvent/Handler`, `ProducerUpdateEvent` — **10 files** | **deleted** | Replaced by runes |

### Generator

| Old | New | Notes |
|---|---|---|
| `generator/ScheduleProducer.java` | `scheduling/generator.ts` | **Port closely.** Same DFS, same `SearchState`, same shortest-course-first ordering, same `maxSolutions` semantics (0 for the main producer; 1→10 escalation for the resolver) |
| `generator/AbstractProblem/ConflictProblem/TimeConflictProblem.java` | `scheduling/problems.ts` | Discriminated union rather than subclasses; `applySolution` becomes a function over selection state |
| `ScheduleProducer.getTimeConflicts` | `scheduling/timeConflicts.ts` | Keep the :00/:30 start-time snapping exactly as-is — it is load-bearing |

### Courses tab

| Old | New |
|---|---|
| `courseselection/CourseSelectionTab.java` | `routes/courses/+page.svelte` |
| `CourseSelectorView.java` + `.ui.xml` | `routes/courses/+page.svelte` (layout via `SplitPane`) |
| `DepartmentListBox.java` | `components/catalog/DepartmentPicker.svelte` — the 6 `AcademicGroup` lists move verbatim into a data constant |
| `CourseList.java`, `CourseListItemBase.java`, `CourseButton.java` | `CourseTable.svelte` + `CourseRow.svelte` |
| `TermView.java`, `TermViewSelection.java` | `TermBadges.svelte` — colors preserved: `#DFFFDF` open, `#ccccff` waitlist, `#fce2b1` full, opacity 0.2 not offered, red disabled |
| `CourseDescriptionInfo.java` + `.ui.xml` | `CourseDetails.svelte` |
| `CourseSelection.java`, `CourseSelectionItem.java` | `SelectedCourseList.svelte` |
| `CourseSelectionController.java` | `state/selection.svelte.ts` |
| `SelectionResources.java` | `lib/styles/` |
| `CourseList.fixCase` | **deleted** — already dead (`// Capitalization handled by Workday now`) |

### Times tab

| Old | New |
|---|---|
| `timechooser/TimeTab.java` | `routes/times/+page.svelte` |
| `TimeChooserView.java` + `.ui.xml`, `TimeTablesGrid.java` | `components/times/TermTimeTabs.svelte` |
| `TimeTable.java` (303 lines) | `TimeGrid.svelte` + `TimeGridCell.svelte` — drag-select via pointer events |
| `TimeChooserController.java` | `state/chosenTimes.svelte.ts` |

### Schedules tab

| Old | New |
|---|---|
| `permutation/PermutationTab.java` | `routes/schedules/+page.svelte` |
| `PermutationChooserView.java` + `.ui.xml` | `components/schedules/SchedulePane.svelte` |
| `PermutationController.java` | `state/permutations.svelte.ts` — the 17-color palette moves verbatim |
| `PermutationScheduleView.java` | `SchedulePane.svelte` (view-mode switch) |
| `PermutationCanvasList.java` | `ScheduleThumbnailList.svelte` + `ScheduleThumbnail.svelte` — **canvas**, ported not rewritten |
| `StudentCourseList.java`, `CourseItem.java`, `SectionCheckbox.java`, `PeriodSelectList.java` | `SectionPicker.svelte` |
| `view/WeekCourseView.java`, `WeekCourseColumn.java` | `WeekGrid.svelte`, `WeekGridColumn.svelte` — DOM tables, not canvas |
| `view/GridCourseView.java` | `QuarterGrid.svelte` |
| `view/PeriodDataGrid.java`, `PeriodItem.java` | `PeriodBlock.svelte` |
| `view/DetailedView.java` | `DetailedView.svelte` |
| `view/PeriodDescriptionDialogBox.java` | `SectionDetailsDialog.svelte` + `primitives/Modal.svelte` |
| `view/ConflictResolverWidget.java` | `ConflictResolver.svelte` — including the `maxSolutions` 1→10 escalation |
| `view/CanvasProgress.java` | `GenerationProgress.svelte` — **canvas** |
| `view/PermutationViewResources.java` | `lib/styles/` |
| `ShareWidget.java` | `ShareLink.svelte` — plus a copy button the old one lacked |

### Storage & info

| Old | New | Notes |
|---|---|---|
| `storage/StorageStudentSchedule.java` | `state/persistence.ts` | Keys `savedCourse`, `selectedDepts`, `chosenTimes`, `favorites` — **format changes**, so namespace them (`wpiplanner.v2.*`) and ignore old keys rather than half-migrating. A `wpiplanner.v2.favorites` entry written before favourites had names still loads, with a blank name |
| `storage/StorageSharing.java` | `share/shareCode.ts` | Hex-CRN encoding → section ids; fixes cross-listing. **Divergence found in the side-by-side pass — see §10.6:** a shared section with no seats left stays switched on here, where the old app drops it |
| `welcome/WelcomeTab.java`, `WelcomeView.java` + `.ui.xml` | `routes/info/+page.svelte` | Static content; carry over verbatim including the YouTube embed and the color legend |

**Count:** 87 Java files → ~55 TS/Svelte files, with 15 deleted outright (10 event
plumbing classes, 2 parsers, `PeriodType`, `HasCourse`, `BaseTab`).

### Beyond parity

Features with no counterpart in the old app. They do not change anything the
ledger above covers.

| Feature | Where | Notes |
|---|---|---|
| **Section filters** — a funnel beside each course in the section rail, filtering its sections by professor | `lib/model/sectionFilters.ts`, `components/primitives/FilterMenu.svelte`, `SectionPicker.svelte` | The options hold no state: an option is ticked while any section it covers is still on, and ticking it off denies exactly those sections. Adding a filter is adding a builder to `SECTION_FILTER_BUILDERS`. |
| **Export to Calendar** — the selected schedule as an `.ics` download | `lib/calendar/`, `components/schedules/CalendarExport.svelte`, third button in `SchedulePane`'s toolbar | Needs term start/end dates, which are not in the Workday export, so `lib/config/academicCalendar.ts` hardcodes them along with no-class days and breaks. **That file is hand-maintained and must be re-transcribed each academic year.** |
| **Import from Workday** — upload the `.xlsx` from Workday's View My Courses screen and load the sections you are registered for | `lib/workday/`, `components/schedules/WorkdayImport.svelte`, fourth button in `SchedulePane`'s toolbar | Workday lists one row per meeting, the catalog stores the lecture+lab pair a student registers for as one section (`AL01/AX01`), so matching compares **sets of section labels**. Reads the `.xlsx` with a hand-rolled ZIP + sheet reader rather than a dependency. Replaces the whole selection, after a confirmation dialog listing what matched and what did not. |

---

## 6. Phases

Each phase ends at a gate that must pass before the next starts.

### Phase 0 — Foundation *(~1 day)* — **done**
Scaffold SvelteKit, tokens, `adapter-static`, CI running `pnpm test`. Copy
`favicon.ico` and `yearHeader.txt` into `static/`.

**Gate:** `pnpm build` emits a static site; `pnpm test` green. ✅ — 62 tool tests
and 289 app tests pass, `pnpm build` writes `build/` with one directory per tab.

### Phase 1 — Model & catalog *(~2 days)* — **done**
`lib/model/*`, `lib/data/loadCatalog.ts`. No UI beyond a debug page.

**Gate:** loading `schedb.json` produces 73/1233/5565/11823 and the counts match
the mapper's summary exactly. `availability.ts` unit-tested against hand-picked
sections whose status is confirmed in the running old app.

✅ `tests/data/realCatalog.test.ts` pins the four counts, the uniqueness of
section ids, and the `AR|2101` / `IMGD|2101` cross-listing. Confirming individual
seat statuses against the running old app is still a manual step.

### Phase 2 — Scheduling core *(~4 days)* — **done, pending the manual old-app check**
`lib/scheduling/*` including `referenceGenerator.ts`. Still no UI.

**Gate:** the parity test (§7) passes — the ported DFS and the brute-force oracle
agree on 500 randomized course sets. Separately, three real course sets produce
the same permutation count as the deployed old app.

✅ `generator.parity.test.ts` runs two sweeps of 500 sets each — one with an open
week, one with times blocked out — and both agree exactly.
⚠️ The real-course-set half is **not** done: `goldenSets.test.ts` pins five real
sets against *this* implementation, not against the deployed app. Expect the
counts to differ wherever an evening or weekend section is involved, because of
the chosen-times fix recorded in §1.

### Phase 3 — Shell & Courses tab *(~4 days)* — **built, pending the screenshot gate**
Layout, header, tabs, and the entire Courses tab. This is the tab users spend the
most time in and the one with the most visual detail.

**Gate:** side-by-side screenshot comparison at 1440×900 and 1024×768 against the
old app: department grouping, sort order, term badge colors, warning icons,
description panel, selected-course box.

### Phase 4 — Times tab *(~2 days)* — **built, pending the side-by-side check**
`TimeGrid` drag-select, per-term grids, persistence.

**Gate:** selecting the same cells in both apps yields the same set of excluded
sections on the Schedules tab.

### Phase 5 — Schedules tab *(~6 days)* — **built, pending the side-by-side check**
The largest phase. Worker wiring, thumbnails, week grids, detail view, conflict
resolver, share links, favorites.

**Gate:** for five saved course sets, both apps show the same schedules in the
same order; the conflict resolver offers the same suggestions for a deliberately
unsatisfiable set.

### Phase 6 — Polish & cutover *(~3 days)* — **partly done**
Info tab, empty/error states, keyboard access, mobile behavior, the 18-course
limit UI, `.claude/CLAUDE.md`.

**Gate:** full manual parity pass over §5; anomaly report reviewed; deploy to a
staging URL alongside the old app for a week.

Done: the Info tab, the inline 18-course limit, error and empty states for the
catalog load and the generator, keyboard resizing on `SplitPane`, and responsive
behaviour on all four tabs. Outstanding: the manual parity pass itself, the
anomaly review, and the staging deploy.

**Total: ~4–5 weeks** for one developer at feature parity, phases 2–5 being the
bulk. Phase 0's mapper is already complete.

---

## 7. How porting fidelity is checked

Five mechanisms, in decreasing order of how much they catch.

**1. The brute-force oracle.** `scheduling/referenceGenerator.ts` enumerates the
full cartesian product of sections and filters by the conflict predicate — obviously
correct, far too slow for real use. A property test generates random small course
sets (2–5 courses, 2–4 sections each, random times) and asserts the ported DFS
returns exactly the same permutation *set*. This is the single highest-value test
in the suite: it catches the subtle DFS bugs that a hand-written fixture will not.

**2. The legacy algorithm itself.** `tools/parity-oracle` compiles the original
GWT `ScheduleProducer` — plus the original conflict controller, model and XML
parser, all unmodified — and runs them off-browser over the same `.schedb`
export, stubbing only browser plumbing that cannot affect a count. This answers
the parity question more sharply than the deployed app can, because it holds the
catalogue fixed and varies only the code. Needs a JDK, so it is not part of
`pnpm test`; the README explains each stub and why it is inert.

**3. Golden fixtures from the real catalog.** `tests/scheduling/goldenSets.test.ts`
pins a handful of real course sets — a single course, a two-term course, a course
whose sections are all full, a cross-listed pair, and the widest course in the
catalog. Every count is confirmed against the oracle above, so these are parity
evidence as well as refactoring guards.

**4. Side-by-side screenshots.** Each UI phase gate is a manual pass with both
apps open at the same viewport. The old app is running at
`https://jmckeen8.github.io/wpiplanner/` — no local GWT build needed.

**5. The parity ledger in §5.** Every row is checked off by a human against the
running old app, not by reading code.

**What is deliberately *not* checked:** old share links and old `localStorage`
payloads. Both formats change; old keys are ignored rather than migrated.

---

## 8. Where the rewrite deliberately improves on the old app

Only in places where the old app has no structure to preserve. The visible
behavior does not change.

| Improvement | Old | New |
|---|---|---|
| Generation is off the main thread | DFS timer-sliced into 30-step chunks so the UI does not freeze | Web Worker; the search runs flat out |
| Parse cost | XML DOM + object graph on load | one `JSON.parse` (~20 ms) |
| Conflict detection | `HashSet<DayOfWeek>` intersection per period pair | `(a & b) !== 0` on a bit mask |
| Component reuse | `WeekCourseView` is instantiated 4× with different term filters but rebuilds all its DOM by hand | `WeekGrid` takes props |
| Layout | `DockLayoutPanel` with hardcoded pixel sizes (50/185/280/250/300/170) | flex/grid; genuinely responsive |
| Deep linking | one URL; tabs swap a `SimplePanel` | one route per tab; back button works |
| Styling | inline `getStyle().setBackgroundColor("#DFFFDF")` scattered across widgets | tokens in `lib/styles/tokens.css`, component styles colocated |
| Section identity | non-unique CRN | unique `dept\|course\|section` id |
| Error handling | `Window.alert`, `e.printStackTrace()`, NPE-as-control-flow | typed errors, inline UI states, a build that fails loudly |

**Not changed, on purpose:** the visual design, the tab structure, the term color
scheme, the 17-color course palette, the 18-course limit, the `TimeCell` grid
constants, and the DFS algorithm itself.

### Deviations added during the build

Five, each small, each with a reason. Nothing else strayed from the old app.

| Deviation | Why |
|---|---|
| **Period block lines stack in flow** instead of being absolutely positioned against the bottom edge, with thresholds 36px/24px rather than 34px/24px | At 34–36px the legacy layout drew the period type on top of the course title. Verified by screenshot; the block is unreadable otherwise. |
| **The term watermark is sized against its container** (`50cqh`) rather than a hardcoded 325px | 325px only looked right at one window size, and clipped badly inside the 2×2 quarter grid. |
| **Routes emit directory-style output** (`courses/index.html`, `trailingSlash: 'always'`) | A plain static host serves `/courses` from that with no rewrite rule; `courses.html` would need one. Answers half of §10.2 whichever way the rest lands. |
| **A favourite carries a name the student can edit** (the pencil label in the Schedules toolbar and under each starred sketch); new stars are named `Favorite N` | The old app showed favourites as unlabelled sketches, so a student comparing four near-identical schedules had no way to record which was which. Names are stored with the section ids; a favourite saved before names existed loads with a blank one. |
| **The browse-list add/remove toggle is a coloured circle** — green `+` outline when a course can be added, red `−` when it is chosen — instead of the legacy square grey button | Requested: the chosen state was hard to spot while scanning the list. Colours are tokens (`--toggle-add*`, `--toggle-remove*`) in `tokens.css`. |

The time-axis column also went from 32px to 38px, because "10AM" was clipped at
32px in the browser's default font stack.

A fourth deviation was proposed and **rejected**: treating cells outside the
chosen-times grid as available, which would have made evening and weekend
sections schedulable. The maintainer chose the old app's behaviour (§10.5), so
the rewrite excludes them exactly as the old app does. The crash is still fixed:
a weekend section is a plain conflict, not an NPE. The only remaining visible
difference is honest text — the resolver marks an out-of-grid block as one no
student action can clear, instead of inviting them to re-enable a cell that does
not exist.

---

## 9. Risks

| Risk | Mitigation | Status |
|---|---|---|
| The DFS port has a subtle bug that only shows on rare inputs | The brute-force oracle (§7.1) — the main reason it exists | ✅ Two sweeps of 500 random course sets agree exactly, one with an open week and one with times blocked out |
| Canvas thumbnail rendering drifts visually | Port the drawing code rather than rewriting it; screenshot gate in Phase 5 | ⚠️ Drawing code ported line for line; the screenshot gate is outstanding |
| The 489 `days="?"` periods behave differently | The mapper already flags them; decide explicitly how they render and test it | ✅ Decided: mask 0 means the period conflicts with nothing and is drawn on no day. Tested in `conflicts` and `timeConflicts`; the details dialog shows "—" for its weekdays |
| `SplitLayoutPanel` drag behavior is hard to match exactly | Build `SplitPane` early (Phase 3) and validate it before it has three consumers | ⚠️ Built first and used by all three consumers, but only checked by eye. Drag feel is the thing most likely to read as "off" in the side-by-side pass |
| Upstream export format changes mid-rewrite | The mapper throws on unknown elements/attributes rather than silently dropping data | ✅ Unchanged |
| Scope creep into redesign | §8 is the complete list of intended changes; anything else is out of scope | ✅ Four deviations, all listed in §8 |
| **New:** the chosen-times fix makes permutation counts differ from the old app for evening and weekend sections | Get a maintainer's decision before the staging deploy; the alternative is a one-line revert in `timeConflicts.ts` | ⚠️ Open |

---

## 10. Open questions for the maintainers

These did not block the build. They block the **cutover**.

1. **`yearHeader.txt` and the `/old` link** — is that still a live mechanism, or
   can the header be static? Implemented as a live fetch, exactly as before; the
   link renders only when line 2 says `true`.
2. **Deployment** — is `planner.wpi.edu` served from a directory ITS drops files
   into, or is there a pipeline the build must fit? The build now emits
   directory-style pages (`courses/index.html`), which a plain file drop serves
   correctly with no rewrite rules. The `data:build` step still needs a home.
3. **How is `new.schedb` refreshed in production** — manual upload, or a job? The
   JSON conversion needs to run at the same point. `pnpm run build:full` does
   both in one command if that helps.
4. **Browser support floor.** Svelte 5 + ES2022 assumes evergreen browsers. Any
   requirement below that? The app also uses CSS container queries (the term
   watermark) and `<dialog>` (the section details modal) — both Chrome/Safari/
   Firefox 2023+.
5. **RESOLVED — the chosen-times boundary (§1, §8).** Should an evening or
   weekend section be schedulable? **Decided: no**, matching the old app.

   The rewrite briefly treated cells outside the Mon–Fri 8:00–18:00 grid as
   available, which made those sections schedulable. `tools/parity-oracle` put a
   number on the difference by running the original `ScheduleProducer` over the
   same export: on the five golden sets the port agreed with the legacy code
   exactly, except CS2102 + MA1021, where legacy found 231 and the fix found
   311. The whole gap was this boundary — 20 of MA1021's 79 open sections carry
   a Tue/Thu 6:00–7:50PM lecture, and 20 × CS2102's 4 open sections is 80.

   The maintainer chose to keep what students see today. `timeConflicts.ts` now
   excludes out-of-grid blocks, the golden set records 231, and the search is at
   full parity with the legacy algorithm on every set tested. The NPE on weekend
   sections is still fixed — that was never the question.

   **One loose end this leaves.** A section that meets entirely outside the grid
   produces a time-conflict problem the student cannot act on. The description
   now says so plainly, but the resolver still renders an APPLY button beside
   it, and pressing it does nothing. Worth either hiding the button for an
   unfixable suggestion or dropping such problems before they reach the
   resolver — a UI decision, not a search one, so it is deliberately left open.

6. **NEW — a shared link naming a section that is now full.** Found in the
   phase-5 side-by-side (§7.4). `loadScheduleFromParam` opened each shared
   course with `addCourse`, which pre-denies every section with no seats left,
   then denied the *other* sections — it never re-enabled the shared one. So a
   share link naming a since-filled section silently loses that course: the old
   app shows the schedule minus that class, with the term badge red.

   The rewrite denies only the other sections, so the shared section stays on
   and the schedule renders as it was shared. Reproduce with any code naming
   AE4220 A01, whose only section is at −1 of 68 seats.

   Which is right is a call for the maintainers. Showing the shared schedule
   seems more useful than silently dropping a class from it, but it means a
   share link can display a section nobody can register for. Local to
   `applyShareLink` in `src/routes/+layout.svelte` either way.

---

## 11. Handoff — where this stands, and what is left

Written at the point where every phase has an implementation and the automated
gates pass. Everything remaining is either a manual comparison against the
running old app or a decision only a maintainer can make.

### What exists

All of §3. `pnpm test` runs 62 tool tests and 289 app tests; `pnpm run check`
reports 0 errors and 0 warnings; `pnpm run build` writes a static site with one
directory per tab. The app was driven end to end in a real browser against the
February 2025 catalog: browsing and picking courses, blocking times, generating
schedules, share links, favourites, the section details dialog, and the conflict
resolver including applying a suggestion.

### What is left, highest value first

**1. Verify the search against the original algorithm — done, by running it.**

`tools/parity-oracle` compiles the original GWT `ScheduleProducer`, conflict
controller, model and XML parser — unmodified — and runs them off-browser over
the same `data/new.schedb`. Only browser plumbing is stubbed, and the README
lists each stub with why it cannot change a count.

| Course set | Legacy | This implementation |
|---|---|---|
| CS2102 alone | 4 | 4 |
| CS1004 + MA1020 | 5 | 5 |
| CS1004 + AR2101 | 4 | 4 |
| AR2101 + IMGD2101 | 12 | 12 |
| CS2102 + MA1021 | 231 | 231 |

All five agree, including the cross-listed pair the old CRN lookup got wrong.
The last row only agrees because the chosen-times boundary was settled in the
old app's favour (§10.5); before that it read 311. The 300-schedule cap turned
out not to be involved anywhere: every search ran to exhaustion.
`tests/scheduling/goldenSets.test.ts` records these as parity evidence.

This holds the catalogue fixed and varies only the code, which is the sharper
version of the question — the deployed old app serves its own export, so a
disagreement there could have been a data difference. What it does **not** cover
is everything outside the search: the UI still needs items 3 and 4 below, and a
quick spot-check of one or two of these sets in the deployed app is still worth
doing as a sanity check on the harness itself.

**2. The chosen-times boundary — decided and implemented** (§10.5). Out-of-grid
blocks conflict, exactly as in the old app; there is no known behavioural
difference in the search left. One loose end, noted in §10.5: the resolver can
still offer an APPLY button for a suggestion nothing can apply. That is a UI
call, so it belongs with item 3.

**3. The side-by-side screenshot passes** for phases 3, 4 and 5, at 1440×900 and
1024×768. **These can be run locally now** — `wpiplanner-master/war/` is the
compiled old app and its bundled `new.schedb` is byte-identical to ours, so
`python3 -m http.server` over that directory gives a real side-by-side without
the deployed site. A legacy share code is `01` plus each CRN as 18 hex digits,
which is enough to put both apps on the same schedule.

A first pass over the Schedules tab has been done and found three grid defects
(fixed: the hour rules and the term watermark were painting under the tinted
columns, and the dotted half-hour rules were missing entirely) plus one
behavioural divergence (§10.6). Still unchecked at both viewports: Specific things worth looking at hardest, because they were built from
reading the Java rather than from watching the old app:

- the term watermark's placement: the old app pins it 128px from the right,
  which is ~27% of a quarter-grid at 1440×900 but ~47% at 1024×768; ours is a
  flat 8%, so it sits further right than the original at wide sizes
- the `SplitPane` drag feel against `SplitLayoutPanel`
- department grouping and the sort order in the course list
- term badge colours in all five states, including the red "term switched off"
- the canvas thumbnails, which were ported drawing-call by drawing-call
- period block text at small heights (already changed once; see §8)

**4. Walk §5 row by row** against the running old app. Every row has an
implementation at the path it names; none has been signed off by a human.

**5. Review the anomaly report** at `data/schedb-report.json` — 489
`unknown-days`, 488 `zero-length-period`, 159 `duplicate-crn`. The behaviour is
decided and tested (§9); what is not done is a human confirming those are the
right decisions.

**6. Staging deploy** alongside the old app for a week.

### Things to know before changing anything

- **`src/lib/scheduling/timeConflicts.ts` and `generator.ts` are close ports.**
  Read their header comments first. The half-hour block snapping and the
  inclusive time comparison in `conflicts.ts` are load-bearing: change either and
  the set of schedules changes.
- **`tests/scheduling/generator.parity.test.ts` is the test that matters.** If a
  change to the search keeps it green, the change is very probably fine. If it
  goes red, the change is wrong — the oracle is obviously correct.
- **`src/lib/model/*.ts` imports its siblings with explicit `.ts` extensions**
  because `tools/` shares those four files under Node type stripping. Everything
  else under `src/` uses extensionless `$lib/...`.
- **`AppState.refresh()` is the single cross-cutting rule.** Anything that
  changes the student's choices must call it, or the Schedules tab goes stale.
  Regeneration is an explicit call rather than an `$effect` so that a burst of
  changes cannot re-enter the search.
- **`localStorage` keys are namespaced `wpiplanner.v2.*`** and the legacy keys are
  ignored on purpose. Do not add a migration; the formats are incompatible by
  design (§5, storage row).
- `.claude/CLAUDE.md` is the file-by-file index. Keep it and §5 current with any
  feature change.
