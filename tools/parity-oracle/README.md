# Parity oracle

Runs the **original** GWT schedule search off-browser, over the same `.schedb`
export the Svelte app uses, and prints how many schedules it finds for a given
set of courses.

PLAN.md §11 lists "verify the search against the deployed old app" as the last
gate that can find a real port bug. Clicking through the deployed app answers a
slightly different question than the one that matters: it runs the old algorithm
over *its own* catalogue, so a disagreement could be a data difference rather
than a port bug. This tool holds the data fixed and varies only the code.

## Running it

Needs a JDK (17 or newer). It is deliberately not wired into `pnpm test`, which
must stay runnable with only Node.

```sh
tools/parity-oracle/run.sh data/new.schedb CS2102 CS1004,MA1020
tools/parity-oracle/run.sh --out-of-grid-open data/new.schedb CS2102,MA1021
```

A course set is comma-separated: `CS2102`, or `CS1004,MA1020`. Course names are
the department abbreviation followed by the number, exactly as the old app's
`Course.toAbbreviation()` builds them.

`--out-of-grid-open` selects every half-hour cell of all seven days instead of
only the Mon–Fri 8:00–18:00 grid. That makes the unmodified legacy producer
behave the way `src/lib/scheduling/timeConflicts.ts` does, which is how the
§10.5 boundary question was isolated (see below).

## What is original and what is a stand-in

Everything that decides how many schedules exist is the original file, copied
byte for byte from `wpiplanner-master`:

- `edu/wpi/scheduler/shared/model/*` — the whole model
- `edu/wpi/scheduler/client/generator/*` — `ScheduleProducer` and the problems
- `edu/wpi/scheduler/client/controller/*` — `ConflictController`,
  `SectionProducer`, `StudentSchedule`, `StudentChosenTimes`, `StudentTermTimes`
- `edu/wpi/scheduler/client/SchedXMLParser.java` — the catalogue parser
- `edu/wpi/scheduler/client/permutation/TimeRangeChange*` — event plumbing

The stand-ins under `com/google/gwt/` and the two stubs under
`client/permutation` and `client/storage` exist only so those files compile and
run without a browser. None of them makes a scheduling decision:

| Stand-in | Why it cannot change the result |
|---|---|
| `HandlerManager`, `GwtEvent`, `Widget`, `Window` | Nothing subscribes; the search never reads an event |
| `Timer` | Never fires, so `ConflictController` keeps an empty cache and every call falls through to `hasConflictsNoCache` — the same answer by a slower route |
| `Storage` | Reports localStorage unsupported, which is the browser's own path for leaving chosen times at the constructor default |
| `JavaScriptObject`, `JsArrayString`, `JsonUtils`, `JSONObject` | Only reachable from the save path, which the oracle never calls; they throw if it ever does |
| `PermutationController` | Holds the one field `ScheduleProducer` reads from it |
| `StorageStudentSchedule` | No-op persistence |

`oracle/W3cXml.java` bridges a JDK `org.w3c.dom` tree to the four GWT XML
methods `SchedXMLParser` calls, so the parser itself needs no edits.

`oracle/ParityOracle.java` reproduces the old UI's stopping rule from
`PermutationController.generateSchedules`: batches of 30 steps, stop once a
batch leaves the count above 300. When the search stops at that cap the tool
also reports the count with the search run to exhaustion.

`oracle/DroppedSections.java` lists the open sections of a course that the
legacy grid silently discards:

```sh
javac -d classes @sources.txt && java -cp classes oracle.DroppedSections data/new.schedb MA1021
```

## Result on the February 2025 catalogue

| Course set | Legacy, as-is | Legacy, `--out-of-grid-open` | Svelte port |
|---|---|---|---|
| CS2102 | 4 | 4 | 4 |
| CS1004 + MA1020 | 5 | 5 | 5 |
| CS1004 + AR2101 | 4 | 4 | 4 |
| AR2101 + IMGD2101 | 12 | 12 | 12 |
| CS2102 + MA1021 | **231** | 311 | **231** |

The port matches the legacy column on every set.

The last row is how PLAN.md §10.5 got settled. When the port treated out-of-grid
cells as available it reported 311 there, and this tool showed the gap was that
rule alone rather than a port bug: `DroppedSections` finds 20 of MA1021's 79
open sections carrying a Tue/Thu 6:00–7:50PM lecture, outside the grid. The
legacy code looks those cells up anyway, finds them absent, and drops the
section from every schedule — 20 dropped sections × CS2102's 4 open sections is
the 80-schedule gap, exactly. The maintainer chose the legacy behaviour, so the
port now reports 231 too and `--out-of-grid-open` is kept only for re-checking
that decision.

No count here is near the 300 cap in a way that matters — every search ran to
exhaustion — so the cap is not involved.
