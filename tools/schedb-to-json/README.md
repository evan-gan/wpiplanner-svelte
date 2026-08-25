# schedb-to-json

Build-time converter that turns the Workday `.schedb` XML export into the compact
JSON catalog the app loads at runtime. Nothing in this directory ships to the
browser.

```
pnpm run data:build
# = node --experimental-strip-types tools/schedb-to-json/src/index.ts \
#       data/new.schedb static/schedb.json --report data/schedb-report.json
```

Measured on the February 2025 export (73 departments, 1,233 courses, 5,565
sections, 11,823 periods):

| | XML | JSON |
|---|---|---|
| On disk | 8.20 MB | 4.69 MB |
| Over the wire (gzip) | 0.52 MB | 0.41 MB |
| Client parse | ~168 ms scan+map in Node (a browser XML DOM is slower) | **~20 ms `JSON.parse`** |

The parse time is the point. The legacy app built a full XML DOM and then an
object graph on the main thread on every page load; the rewrite does one
`JSON.parse` of a structure that is already in its final shape.

## Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | CLI: argument parsing, file I/O, summary output |
| `src/convert.ts` | Ties the scanner to the builder — the one function callers need |
| `src/xmlScanner.ts` | Attribute-only XML tokenizer; throws on anything outside the expected shape |
| `src/entities.ts` | XML entity and character-reference decoding |
| `src/mapSchedb.ts` | `SchedbBuilder` — turns tag events into the wire format |
| `src/attributes.ts` | Attribute readers that name the offending record when they fail |
| `src/descriptionPool.ts` | Interns repeated description text |
| `src/days.ts`, `src/terms.ts`, `src/time.ts` | Value parsers, each independently tested |
| `src/report.ts` | `AnomalyLog` — data-quality findings collected during a run |
| `tests/` | `node --test` suites, run by `pnpm run test:tools` |

The wire format itself is defined once in
[`src/lib/model/schedb.ts`](../../src/lib/model/schedb.ts) and imported by both
this tool and the app, so producer and consumer cannot drift.

## Failure behavior

Structural problems **throw** and fail the build, naming the record:

```
Missing required attribute "seats" on CS|2011|A01.
Could not parse time "9:0AM"; expected a form like "9:00AM".
Unexpected element <newthing>; expected one of schedb, dept, course, section, period.
```

Values that are legal but suspicious are **collected** into the anomaly report
rather than aborting the run. On the February 2025 export:

| Kind | Count | Meaning |
|---|---|---|
| `unknown-days` | 489 | Source listed `days="?"` — the period cannot be placed on a weekly grid |
| `zero-length-period` | 488 | Start and end times are identical (overlaps the above almost exactly) |
| `duplicate-crn` | 159 | Cross-listed courses share a CRN — see below |

## Two things the legacy parser got wrong

**CRNs are not unique.** 149 CRNs are shared by two cross-listed sections
(`AR|2101|A01` and `IMGD|2101|A01` are the same class under two departments). The
GWT `getSectionByCRN` scan returned whichever department parsed first, so share
links and favorites silently resolved cross-listed courses into the wrong
department. Sections here carry an explicit `id` of
`${dept}|${courseNumber}|${sectionNumber}`, which **is** unique across all 5,565
sections. Use it as the key; `crn` is retained for display only, as a string,
because the 18-digit values exceed `Number.MAX_SAFE_INTEGER`.

**Midnight.** `Time(String)` in the old model left `"12:00AM"` at hour 12 rather
than 0. `parseClockTime` follows the clock and logs a `midnight-hour` anomaly so
a genuinely missing time is visible rather than silently landing at noon.
