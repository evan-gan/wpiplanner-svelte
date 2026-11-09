# Updating the planner

Most data keeps itself current: the deployed site refetches sections and seat
counts from Workday every ten minutes. The parts below are maintained by hand.
Open the one you need.

| Part | When |
|---|---|
| [Course prerequisites / background](#course-prerequisites--background) | Whenever course descriptions change. Check after every `pnpm updateData`. |
| [Fallback catalog](#fallback-catalog) | Every so often, and at the start of each academic year. |
| [Academic calendar (term dates, holidays, breaks)](#academic-calendar-term-dates-holidays-breaks) | Every academic year. |
| [Converter rules (departments, special-topics courses)](#converter-rules-departments-special-topics-courses) | Every academic year. |
| [Link to the old planner](#link-to-the-old-planner) | When the old planner is retired or brought back. |

---

## Course prerequisites / background

<details>
<summary>Check for changed course descriptions, and fix their entries</summary>

Prerequisites, recommended background, and "no credit for both" rules are read
by hand from each course's description and stored in
[`src/lib/config/courseBackground/<DEPT>.yaml`](src/lib/config/courseBackground/).
Each entry keeps a copy of the description it was read from. When WPI changes a
description, or adds a course, its entry no longer matches. The planner then
**hides that course's Background section** rather than show something out of
date.

### Check

```sh
pnpm updateData            # pull the current descriptions first
pnpm background status     # per department: done / stale / unchecked
```

- **stale**: the course's description changed since its entry was written.
- **unchecked**: the course has no entry at all (usually a new course or department).

Every department should end with `✓`. For each one that doesn't:

```sh
pnpm background todo CS    # prints each stale/unchecked CS course with its full description
```

### Fix

Open `src/lib/config/courseBackground/CS.yaml`. For a **stale** course, edit its
existing entry. For an **unchecked** course, add a new one under `entries:`. If
the department is new, create the file with `department: CS` and
`entries: []` on two lines. Then:

1. Paste the course's **current description** into `description`, character for
   character, inside double quotes (escape any `"` in it as `\"`). This is what
   marks the entry as up to date.
2. Read the description and fill in the other fields.
3. Run `pnpm background check` (validates every file) and `pnpm background
   status` again. `pnpm build` and `pnpm dev` also refuse to start on a file
   that doesn't validate.

Every course gets an entry, **even one with no prerequisites**. Use
`clauses: []` for it; that records "checked, none", as opposed to "never
checked".

```yaml
  - courseId: CS|3733
    description: "…the full current description…"
    clauses:
      - strength: recommended
        timing: prior
        sourceText: "Recommended background: CS 2102, CS 2103, or CS 2119."
        requirement:
          kind: anyOf
          of:
            - kind: course
              course: CS|2102
            - kind: course
              course: CS|2103
            - kind: course
              course: CS|2119
    noCreditWith:
      - CS|509
```

A small requirement can also go on one line, e.g.
`requirement: { kind: course, course: MA|2051, orEquivalent: true }`. Both
forms are YAML and mean the same thing.

The YAML is only for editing. The build ships a much smaller form: each
description is replaced by a short hash, and `sourceText` and `needsReview` are
dropped. Editing the YAML is all that's needed; there is no separate step.

### Entry fields

| Field | What goes in it |
|---|---|
| `courseId` | `DEPT\|NUMBER`, e.g. `CS\|3733`. |
| `description` | The current catalog description, verbatim (`""` if the course has none). |
| `clauses` | One per stated condition (below). `[]` when there are none. |
| `noCreditWith` | Courses that can't also be taken for credit ("Students may not receive credit for both CS 3733 and CS 509" → `["CS\|509"]`). `[]` when none. |
| `needsReview` | *Optional.* A short note when the wording is ambiguous, for someone to check later. |

### Clause fields

| Field | Values |
|---|---|
| `strength` | `required` ("Prerequisite"), `recommended` ("Recommended background"), `suggested` ("Suggested background", or "helpful but not required"). |
| `timing` | `prior` (take before), `concurrent` (take at the same time, i.e. a corequisite), `priorOrConcurrent` (either). |
| `sourceText` | The sentence the clause came from, copied verbatim. |
| `requirement` | What is needed, built from the kinds below. |

### Requirement kinds

Nest these as deep as the sentence needs.

| `kind` | Use for | Shape |
|---|---|---|
| `course` | One course | `{ "kind": "course", "course": "MA\|2051", "orEquivalent": true }` (`orEquivalent` optional) |
| `anyOf` | "X or Y" | `{ "kind": "anyOf", "of": [ … ] }` (two or more items) |
| `allOf` | "X and Y", or a list of separate subjects | `{ "kind": "allOf", "of": [ … ] }` (two or more items) |
| `countOf` | "two of X, Y, Z" | `{ "kind": "countOf", "count": 2, "of": [ … ] }` |
| `topic` | "differential equations (MA 2051 or equivalent)" | `{ "kind": "topic", "topic": "differential equations", "satisfiedBy": { … } }` (`satisfiedBy` optional) |
| `permission` | Instructor or department approval | `{ "kind": "permission", "text": "instructor approval" }` |
| `standing` | Class year, major, or "closed to …" restrictions | `{ "kind": "standing", "text": "junior standing" }` |
| `other` | Anything else, worded as the description words it | `{ "kind": "other", "text": "…" }` |

The full reading guide, with more worked examples, is in
[`tools/course-background/README.md`](tools/course-background/README.md). The
types are in
[`src/lib/model/courseBackground.ts`](src/lib/model/courseBackground.ts).

</details>

## Fallback catalog

<details>
<summary>Refresh the committed copy of the course catalog</summary>

The live site reads the catalog from its own endpoint and only falls back to the
committed `static/schedb.json` if that endpoint is down. Local development uses
the committed file too, as do the tests that check the real catalog.

```sh
pnpm updateData
```

Read the summary it prints: department, course, and section counts should be in
the same range as last time. Then commit `static/schedb.json` and
`static/yearHeader.txt`.

After refreshing, run the [course background check](#course-prerequisites--background).
Any changed descriptions show up there.

</details>

## Academic calendar (term dates, holidays, breaks)

<details>
<summary>Roll the calendar over to a new academic year</summary>

Calendar export ("Export to Calendar") needs to know when each term runs, which
days have no classes, and which days follow another day's schedule. None of this
is in the Workday data, so it is transcribed by hand from the
[Registrar's academic calendar](https://www.wpi.edu/academics/calendar) into
[`src/lib/config/academicCalendar.ts`](src/lib/config/academicCalendar.ts).

1. Replace `academicYear`, the four term ranges (`terms`), every entry in
   `exceptions`, and every entry in `breaks`.
2. In `exceptions`, keep only days that change when classes meet:
   - a "No Classes" day → `followsDay: null`;
   - a "Follow Monday schedule" day → `followsDay: 'mon'` (or whichever day it follows).
3. Put breaks that fall *inside* a term (e.g. Thanksgiving) in `breaks`; they
   cancel the classes they cover. Breaks between terms are listed for reference
   only.
4. Run `pnpm test`. `tests/calendar/academicCalendar.test.ts` checks that the
   terms are in order, don't overlap, and that every exception lands inside a
   term.

</details>

## Converter rules (departments, special-topics courses)

<details>
<summary>Check the Workday converter's hand-kept lists each year</summary>

The converter (`tools/workday-to-schedb/`) turns the Workday feed into the
planner's catalog. Two lists in it cannot be worked out from the feed.

1. **New departments.** Run `pnpm updateData` and look for an `unknown-subject`
   anomaly in its output. Each one is a new subject code: add it to
   [`tools/workday-to-schedb/src/departments.ts`](tools/workday-to-schedb/src/departments.ts),
   or its courses get filed under "Other".
2. **Special-topics courses.** Some course numbers are really a different class
   in every section (e.g. HU 3900, the Great Problems Seminars). Check
   [`tools/workday-to-schedb/src/rules.ts`](tools/workday-to-schedb/src/rules.ts)
   against the new catalog:
   - `SPECIAL_COURSES`: course numbers whose sections are all different classes;
   - `SPECIAL_SECTION_MARKERS`: section-title prefixes that mean the same thing (`GPS:`, `- ST:`, …).
3. Run `pnpm test`.

More on how the converter works is in
[`tools/workday-to-schedb/README.md`](tools/workday-to-schedb/README.md).

</details>

## Link to the old planner

<details>
<summary>Show or hide the link to the previous planner</summary>

The header can show a link to the old planner at `/old`. It is controlled by the
`SHOW_OLD_SCHEDULE_LINK` environment variable. On Vercel, set it to `true` in
the project's environment variables to show the link; remove it or set anything
else to hide it. Locally, `pnpm updateData --show-old-link` writes the same
setting into the committed `static/yearHeader.txt`.

</details>
