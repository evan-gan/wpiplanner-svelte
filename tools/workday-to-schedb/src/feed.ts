/**
 * The Workday course-listings feed: its shape, and the rows worth keeping.
 *
 * Source: https://courselistings.wpi.edu/assets/prod-data.json — one flat array
 * of section rows under `Report_Entry`, roughly 6.5MB and 3,800 rows. Every
 * field is a string; absent values arrive as `""` rather than being omitted.
 */

/**
 * One row of `Report_Entry`.
 *
 * Only the fields the converter reads are declared. Two fields the legacy
 * converter depended on are **no longer published**: `cour_sec_def_referenceID`
 * (the CRN) and `Academic_Year`. Sections therefore carry no CRN, and the
 * academic year is inferred from `Offering_Period` — see
 * {@link detectAcademicYear}.
 */
export interface ReportEntry {
  /** "AB 1531-A01 - Elementary Arabic I" */
  Course_Section: string;
  /** "AB 1531 - Elementary Arabic I" */
  Course_Title: string;
  /** "2026 Fall A Term" */
  Offering_Period: string;
  /** "A Term", "B Term", "C Term", "D Term", "Fall", "Spring" */
  Starting_Academic_Period_Type: string;
  /** "Lecture", "Laboratory", "Discussion", "Seminar", "Workshop", ... */
  Instructional_Format: string;
  /** "Open", "Waitlist", "Closed", "Canceled: Preliminary" */
  Section_Status: string;
  /** "Olin Hall 126 | M-T-R-F | 9:00 AM - 9:50 AM", `;`-separated per meeting. */
  Section_Details: string;
  /** "20/20" — enrolled over capacity. */
  Enrolled_Capacity: string;
  /** "1/9" — students waiting over waitlist capacity. */
  Waitlist_Waitlist_Capacity: string;
  Instructors: string;
  /** HTML. The only description the feed still publishes. */
  Course_Description: string;
  /** "3", "0.75", "1.5" */
  Credits: string;
  /** Opaque id shared by the components of one lecture/lab/discussion cluster. */
  CF_LRV_Cluster_Ref_ID: string;
}

export interface WorkdayFeed {
  Report_Entry: ReportEntry[];
}

/** A section that Workday has withdrawn before registration; never shown. */
const CANCELED_STATUS = 'Canceled: Preliminary';

/**
 * The academic year the catalog covers, as fall and spring calendar years.
 *
 * Every offering period names its calendar year, and the feed carries a handful
 * of rows for terms outside the current year (next fall's early listings, a late
 * start online term). Taking the fall year that the most rows agree on picks the
 * current catalog without a hand-edited config, so the yearly rollover is just a
 * re-run of the fetch.
 */
export interface AcademicYear {
  fallYear: number;
  springYear: number;
}

const FALL_PERIOD_PATTERN = /^(\d{4}) Fall /;

export function detectAcademicYear(entries: readonly ReportEntry[]): AcademicYear {
  const rowsPerFallYear = new Map<number, number>();

  for (const entry of entries) {
    const match = FALL_PERIOD_PATTERN.exec(entry.Offering_Period);
    if (match === null) continue;

    const year = Number(match[1]);
    rowsPerFallYear.set(year, (rowsPerFallYear.get(year) ?? 0) + 1);
  }

  if (rowsPerFallYear.size === 0) {
    throw new Error(
      'No row in the feed had an Offering_Period like "2026 Fall A Term", so the academic ' +
        'year could not be determined. The feed format has probably changed.',
    );
  }

  let fallYear = 0;
  let mostRows = -1;
  for (const [year, rowCount] of rowsPerFallYear) {
    if (rowCount > mostRows) {
      fallYear = year;
      mostRows = rowCount;
    }
  }

  return { fallYear, springYear: fallYear + 1 };
}

/** The six offering periods the planner lays out, for a given academic year. */
export function offeringPeriodsFor({ fallYear, springYear }: AcademicYear): Set<string> {
  return new Set([
    `${fallYear} Fall A Term`,
    `${fallYear} Fall B Term`,
    `${fallYear} Fall Semester`,
    `${springYear} Spring C Term`,
    `${springYear} Spring D Term`,
    `${springYear} Spring Semester`,
  ]);
}

/** "2026 - 2027 Academic Year", line 1 of `yearHeader.txt`. */
export function formatAcademicYearHeader({ fallYear, springYear }: AcademicYear): string {
  return `${fallYear} - ${springYear} Academic Year`;
}

/**
 * Whether a row belongs in the planner at all.
 *
 * Three exclusions, all inherited from the legacy converter:
 * - withdrawn sections;
 * - terms the planner does not lay out (summer, late-start online, next year);
 * - the lab and discussion components of an interest list, which have no
 *   meeting times and would otherwise multiply out against its lecture.
 */
export function isPlannableEntry(entry: ReportEntry, validOfferingPeriods: ReadonlySet<string>): boolean {
  if (entry.Section_Status === CANCELED_STATUS) return false;
  if (!validOfferingPeriods.has(entry.Offering_Period)) return false;

  const isInterestList = entry.Course_Section.includes('Interest List');
  return !isInterestList || entry.Instructional_Format === 'Lecture';
}
