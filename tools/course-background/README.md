# Course background

Structured prerequisites, recommended background, corequisites, and
"no credit for both" rules, read out of the free-text course descriptions in
`static/schedb.json`.

- **Shape:** `src/lib/model/courseBackground.ts` (types + validator). Read its
  comments; they are the spec.
- **Data:** `src/lib/config/courseBackground/<DEPT>.yaml`, one file per department.
  YAML for editing; `vite/courseBackgroundPlugin.ts` validates each file and
  ships it compacted (descriptions → hash, `sourceText`/`needsReview` dropped),
  so a broken file also fails `pnpm build`/`pnpm dev`.
- **Tool:** `tools/course-background/src/index.ts`.

```bash
pnpm background status        # progress per department
pnpm background todo AE       # every AE course still needing an entry, with its full description
pnpm background check         # validate all files (also run by `pnpm test`)
```

**Every catalog course gets an entry**, including those with no background, so
"read, and there is none" is distinguishable from "never read". After
`pnpm updateData`:

- a course new to the catalog has no entry → **unchecked**;
- a course whose description changed → **stale** (`todo` marks it `[STALE]`).

Both show up in `status` and `todo`, and `courseBackgroundStatus()` reports them
so app features can treat them as "unknown", never as "no prerequisites".
Entries for courses that drop out of the catalog are kept, since courses not
offered one year usually come back with the same text.

## How to read a description

One entry for **every** course `todo` lists — even when the text turns out to
say nothing about background (e.g. "concurrent processes are studied", or a
description with no conditions at all). Such an entry has `"clauses": []` and
still records the description, which marks it as read. A course with an empty
description also gets `"clauses": []` and `"description": ""`.

Read the whole description, not just a "Prerequisite:" line. Conditions hide in
other wording too: "Students cannot receive credit for this course if they have
taken X" (→ `noCreditWith`), "Continuation of X" / "assumes familiarity with
X" (→ `recommended`), "open only to …" (→ `standing`).

| Text says | `strength` | `timing` |
|---|---|---|
| Prerequisite(s): | `required` | `prior` |
| Recommended background: | `recommended` | `prior` |
| Suggested background: | `suggested` | `prior` |
| Corequisite / must be taken concurrently | `required` | `concurrent` |
| "taken previously or concurrently", "prior or concurrent" | per the lead word | `priorOrConcurrent` |

Requirement trees:

- A comma list of separate subjects is `allOf`. Inside one subject, "X, Y or
  equivalent" / "X or Y" is `anyOf`. When a description lists courses in a
  sequence with commas and no "or" ("MA 1021, MA 1022, MA 1024"), it means all
  of them: `allOf`.
- "subject (COURSES)" → `topic` with `satisfiedBy`. A subject with no course →
  `topic` alone.
- Course codes become catalog ids: "MA 2051", "MA2051" → `"MA|2051"`. A code
  written with a slash shorthand ("PH1110 / 1111") expands to both courses.
- "or equivalent" attaches `orEquivalent: true` to each course it covers.
- "instructor approval / consent / permission" → `permission`. "junior
  standing", "graduate students", "majors only" → `standing`.
- Never put a one-item group in `allOf`/`anyOf` — use the item itself.
- `sourceText` is copied verbatim from the description.
- "Students may not receive credit for both X and Y" → put the course(s) other
  than this one in `noCreditWith`.
- If the meaning is unclear, structure your best reading and set `needsReview`
  to a short note of what is uncertain. Do not invent course codes.

## Worked example

`AE|2110` — "…Recommended background: differential equations (MA2051 or
equivalent), dynamics (ES 2503, PH 2101 or equivalent), thermodynamics (ES 3001,
PH 2101, CH 3510 or equivalent). Students may not receive credit for both AE
2110 and AE 3602."

```yaml
  - courseId: AE|2110
    description: "<the whole description, verbatim>"
    clauses:
      - strength: recommended
        timing: prior
        sourceText: "Recommended background: differential equations (MA2051 or equivalent), dynamics (ES 2503, PH 2101 or equivalent), thermodynamics (ES 3001, PH 2101, CH 3510 or equivalent)."
        requirement:
          kind: allOf
          of:
            - kind: topic
              topic: differential equations
              satisfiedBy: { kind: course, course: MA|2051, orEquivalent: true }
            - kind: topic
              topic: dynamics
              satisfiedBy:
                kind: anyOf
                of:
                  - { kind: course, course: ES|2503, orEquivalent: true }
                  - { kind: course, course: PH|2101, orEquivalent: true }
            - kind: topic
              topic: thermodynamics
              satisfiedBy:
                kind: anyOf
                of:
                  - { kind: course, course: ES|3001, orEquivalent: true }
                  - { kind: course, course: PH|2101, orEquivalent: true }
                  - { kind: course, course: CH|3510, orEquivalent: true }
    noCreditWith:
      - AE|3602
```

`AB|1532` — "Recommended background: AB1531 or instructor approval; …closed to
native speakers…" → `anyOf` of `course AB|1531` and `permission "instructor
approval"`, plus a second clause `{ strength: "required", requirement: {kind:
"standing", text: "closed to native speakers of Arabic and heritage speakers
except with written permission from the instructor"} }`.
