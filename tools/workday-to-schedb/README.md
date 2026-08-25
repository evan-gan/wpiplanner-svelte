# workday-to-schedb

Refreshes the catalog the app loads, straight from WPI's live Workday feed:

```
pnpm updateData
# = node --experimental-strip-types tools/workday-to-schedb/src/index.ts \
#       --output static/schedb.json --year-header static/yearHeader.txt \
#       --report data/schedb-report.json
```

It fetches <https://courselistings.wpi.edu/assets/prod-data.json>, converts it,
and writes `static/schedb.json` and `static/yearHeader.txt`. Nothing in this
directory ships to the browser.

Measured on the August 2026 feed (3,762 rows, 3,673 of them in the planned
terms): 67 departments, 1,271 courses, 4,780 sections, 9,431 periods —
6.37 MB of feed to a 3.89 MB catalog.

## Why this exists

The catalog used to arrive by a two-step path: the Java
[WorkdayToPlannerConverter](../../../WorkdayToPlannerConverter-master) turned a
saved copy of the feed into `new.schedb` XML, and `tools/schedb-to-json` turned
that XML into `schedb.json`. This tool collapses both steps and drops the
intermediate format, so refreshing the data is one command with no JDK and no
hand-edited properties file.

`tools/schedb-to-json` stays: `data/new.schedb` is the February 2025 export the
search was verified against by `tools/parity-oracle`, and
`tests/scheduling/goldenSets.test.ts` converts it at test time to keep that
evidence alive across data refreshes.

## What the feed looks like

One flat array of section rows. Every field is a string, and absent values
arrive as `""` rather than being omitted:

```json
{ "Report_Entry": [ {
  "Course_Section": "CS 2102-BL01 - Object-Oriented Design Concepts",
  "Course_Title": "CS 2102 - Object-Oriented Design Concepts",
  "Offering_Period": "2026 Fall B Term",
  "Starting_Academic_Period_Type": "B Term",
  "Instructional_Format": "Lecture",
  "Section_Status": "Open",
  "Section_Details": "Atwater Kent 116 | M-T-R-F | 12:00 PM - 12:50 PM",
  "Enrolled_Capacity": "25/25",
  "Waitlist_Waitlist_Capacity": "0/10",
  "Instructors": "Yu-Shan Sun",
  "Course_Description": "<p>Cat. I<br />This course introduces …</p>",
  "Credits": "3",
  "CF_LRV_Cluster_Ref_ID": "STUDENT_COURSE_SECTION_CLUSTER-3-5323"
} ] }
```

**Two fields the legacy converter relied on are gone.** The feed no longer
publishes `cour_sec_def_referenceID`, so sections carry no CRN (`crn` is `""`,
and the calendar export omits the CRN line rather than printing an empty one);
and it no longer publishes `Academic_Year` or `Course_Section_Description`, so
the academic year is inferred from `Offering_Period` and one description serves
both the course and its sections.

## Refresh time

The feed carries no timestamp inside it, so the HTTP `Last-Modified` header is
what the header bar shows as "Schedule Data Refreshed". Reading a saved feed with
`--input` uses that file's mtime instead, so both paths produce the same shape.

## Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | CLI: options, file I/O, summary output |
| `src/fetchFeed.ts` | Fetching or reading the feed, and the `Last-Modified` timestamp |
| `src/feed.ts` | The feed's shape, which rows are plannable, and the academic year |
| `src/parseEntry.ts` | One row -> parsed values: section label, seats, term, instructor |
| `src/periods.ts` | `Section_Details` -> periods |
| `src/combine.ts` | Lecture + discussion + lab -> the registrable section |
| `src/buildSchedb.ts` | Grouping into departments, courses, sections |
| `src/departments.ts` | Subject code -> department name. **Edit when a new subject appears.** |
| `src/rules.ts` | Special-topics courses and section markers. **Edit yearly.** |
| `src/html.ts` | Description HTML -> plain text |
| `src/report.ts` | This tool's anomaly vocabulary |
| `tests/` | `node --test` suites, run by `pnpm run test:tools` |

`DescriptionPool` and `AnomalyLog` are shared with `tools/schedb-to-json` and
live in [`tools/shared/`](../shared).

## The rules that are not in the feed

Three things the feed does not say, which the converter has to know. All of them
came from the legacy `planner.properties`.

**Which terms count.** Only the six offering periods the planner lays out —
A/B/Fall and C/D/Spring for the current academic year. Summer, late-start online,
and next year's early listings are dropped. The year itself is whichever fall
year the most rows agree on, so the yearly rollover needs no edit here.

**How components combine.** Workday publishes a lecture, its conferences, and its
labs as separate rows; students register for a combination. The converter emits
one section per compatible combination — "AL01/AX01", "AL01/AX02" — where
compatible means the components share a cluster (where clusters are declared) and
their meetings do not overlap. Only each component's *first* meeting is compared,
which is what the legacy converter did; widening it would change which sections
the catalog contains.

**Which courses are really several courses.** `HU 3900` is a different seminar in
every section, so its sections keep their full titles in the label and only
combine inside a declared cluster. `src/rules.ts` lists those courses and the
title markers (`GPS:`, `- ST:`, …) that mean the same thing.

## Options

```
--url <url>            Feed URL (default: the live prod-data.json)
--input <path>         Convert a saved feed instead of fetching
--output <path>        Catalog to write (default: static/schedb.json)
--year-header <path>   Year header to write (default: static/yearHeader.txt)
--no-year-header       Leave the year header alone
--report <path>        Write the data-quality anomaly log as JSON
--save-feed <path>     Also save the raw feed exactly as fetched
--show-old-link        Write "true" on line 2 of the year header
--pretty               Indent the catalog (much larger; for inspection only)
```

Anomalies are collected, not fatal: an unreadable meeting time still throws,
but a section with no location or no meeting at all is reported and converted.
`--report` writes them in full. The August 2026 feed produces 166
`no-meeting-times` findings, all of them interest lists and asynchronous online
sections, and nothing else.

## Yearly checklist

1. `pnpm updateData`, and read the summary: department, course, and section
   counts should be in the same range as last year.
2. Any `unknown-subject` anomaly means a new subject code — add it to
   `src/departments.ts`, or its courses stay filed under "Other".
3. Check `src/rules.ts` against the new catalog's special-topics courses.
4. Update `src/lib/config/academicCalendar.ts` — term dates and no-class days are
   not in the feed. Its own rollover checklist is at the bottom of that file.
