/**
 * Wire format for the compiled schedule database (`schedb.json`).
 *
 * This file is the single source of truth for the shape of the data produced by
 * `tools/schedb-to-json` and consumed by the app. The build tool imports these
 * types directly so the producer and consumer can never drift apart.
 *
 * Design notes (differences from the legacy `.schedb` XML, and why):
 *
 * - Times are minutes since midnight rather than `{hour, minutes}` objects.
 *   They compare, sort, and subtract with plain integer math, which removes an
 *   entire class of `Time.compareTo` bugs and shrinks the payload.
 * - Days are a 7-bit mask rather than a set of strings. Overlap testing in the
 *   permutation generator becomes `(a & b) !== 0`, which matters because that
 *   test runs in the innermost loop of the search.
 * - Description text is deduplicated into a shared `descriptions` pool. Course
 *   and section descriptions are near-identical across the catalog: ~4.0MB of
 *   raw text collapses to ~0.9MB.
 * - Sections carry an explicit `id` instead of being keyed by CRN. CRNs are NOT
 *   unique in the source data — cross-listed courses (e.g. AR2101 / IMGD2101)
 *   share a CRN, so the legacy `getSectionByCRN` lookup silently resolved to
 *   whichever department happened to be parsed first.
 */

export const SCHEDB_FORMAT_VERSION = 1;

/** Bit positions for {@link PeriodJson.days}. Sunday is the low bit. */
export const DAY_BITS = {
  sun: 1 << 0,
  mon: 1 << 1,
  tue: 1 << 2,
  wed: 1 << 3,
  thu: 1 << 4,
  fri: 1 << 5,
  sat: 1 << 6,
} as const;

export type DayShortName = keyof typeof DAY_BITS;

/** Academic terms, in calendar order. */
export type TermName = 'A' | 'B' | 'C' | 'D';

/** Index into {@link SchedbFile.descriptions}, or -1 when no text was provided. */
export type DescriptionIndex = number;

export interface PeriodJson {
  /** Free-text meeting type from Workday: "Lecture", "Lab", "Discussion", ... */
  type: string;
  professor: string;
  /** Bitmask of {@link DAY_BITS}. Zero means the source listed days as "?". */
  days: number;
  /** Minutes since midnight. */
  startMinutes: number;
  /** Minutes since midnight. */
  endMinutes: number;
  /** Building + room, collapsed and trimmed. Often empty in Workday exports. */
  location: string;
  seats: number;
  seatsAvailable: number;
  actualWaitlist: number;
  maxWaitlist: number;
  /** Section label repeated on the period row, e.g. "B01". */
  sectionNumber: string;
}

export interface SectionJson {
  /** Stable unique key: `${deptAbbrev}|${courseNumber}|${sectionNumber}`. */
  id: string;
  /** Raw 18-digit CRN as a string — it exceeds Number.MAX_SAFE_INTEGER. */
  crn: string;
  /** Section label, e.g. "A01". */
  number: string;
  /** Raw `part-of-term` text, e.g. "A Term, B Term". Kept for display. */
  termLabel: string;
  /** Parsed terms this section spans. */
  terms: TermName[];
  seats: number;
  seatsAvailable: number;
  actualWaitlist: number;
  maxWaitlist: number;
  descriptionIndex: DescriptionIndex;
  periods: PeriodJson[];
}

export interface CourseJson {
  /** Stable unique key: `${deptAbbrev}|${courseNumber}`. */
  id: string;
  /** Course number, e.g. "2102". */
  number: string;
  /** Course title, e.g. "Object-Oriented Design Concepts". */
  name: string;
  minCredits: number;
  maxCredits: number;
  descriptionIndex: DescriptionIndex;
  sections: SectionJson[];
}

export interface DepartmentJson {
  /** Department abbreviation, e.g. "CS". Unique, and used as the department id. */
  abbrev: string;
  name: string;
  courses: CourseJson[];
}

export interface SchedbFile {
  formatVersion: typeof SCHEDB_FORMAT_VERSION;
  /** Generation timestamp copied verbatim from the source, shown in the header. */
  generated: string;
  /** Scheduling block granularity declared by the source, in minutes. */
  minutesPerBlock: number;
  /** Shared pool referenced by {@link DescriptionIndex} values. */
  descriptions: string[];
  departments: DepartmentJson[];
}
