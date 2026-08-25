/**
 * One feed row -> the values the catalog needs, with the naming quirks resolved.
 *
 * Everything here is pure string work on a single row. Grouping rows into
 * courses and combining lecture/lab pairs happens later, in `buildSchedb.ts`.
 */
import type { TermName } from '../../../src/lib/model/schedb.ts';
import { parseTerms } from '../../../src/lib/model/terms.ts';
import type { ReportEntry } from './feed.ts';
import { htmlToPlainText } from './html.ts';
import { hasSpecialSectionMarker, isInterestListSection, isSpecialCourse } from './rules.ts';
import type { AnomalyLog } from './report.ts';

/** "AB 1531-A01 - Elementary Arabic I" -> subject, number, and the rest. */
const COURSE_SECTION_PATTERN = /^([A-Za-z]+)\s+([^\s-]+)-(.+)$/;

/** Shown for a section Workday left without an instructor. */
const UNASSIGNED_INSTRUCTOR = 'Not Assigned';

/** An interest list has no instructor to assign, so it says so plainly. */
const INTEREST_LIST_INSTRUCTOR = 'N/A';

export interface ParsedEntry {
  /** e.g. "CS" — the department key, before the "Other" fallback is applied. */
  subjectCode: string;
  /** e.g. "2102" */
  courseNumber: string;
  /** e.g. "Object-Oriented Design Concepts" */
  courseName: string;
  /** e.g. "A01", or the full section title for a special-topics course. */
  sectionNumber: string;
  /** Raw part-of-term text kept for display, e.g. "A Term, B Term". */
  termLabel: string;
  terms: TermName[];
  /** "Lecture" / "Lab" / "Discussion" / "Seminar" / ... */
  meetingType: string;
  instructor: string;
  /** Empty when the section is not part of a cluster. */
  clusterId: string;
  credits: number;
  seats: number;
  seatsAvailable: number;
  actualWaitlist: number;
  maxWaitlist: number;
  /** Plain-text course description, already stripped of HTML. */
  description: string;
  /** Special-topics style course: label carries the title, clusters are required. */
  isSpecial: boolean;
  isInterestList: boolean;
  raw: ReportEntry;
}

/**
 * Turn a feed row into the values the catalog needs.
 *
 * @param entry One `Report_Entry` row, already filtered by `isPlannableEntry`
 * @param log Collects values that were legal but suspicious
 * @returns The parsed row, or null when `Course_Section` was unusable
 */
export function parseEntry(entry: ReportEntry, log: AnomalyLog): ParsedEntry | null {
  const match = COURSE_SECTION_PATTERN.exec(entry.Course_Section.trim());
  if (match === null) {
    log.add(
      'unparsable-course-section',
      entry.Course_Section,
      'Expected a form like "AB 1531-A01 - Elementary Arabic I"; the row was skipped.',
    );
    return null;
  }

  const [, subjectCode, courseNumber, sectionAndTitle] = match;
  const isInterestList = isInterestListSection(entry.Course_Section);
  const isSpecial =
    !isInterestList &&
    (isSpecialCourse(subjectCode, courseNumber) || hasSpecialSectionMarker(entry.Course_Section));

  const termLabel = termLabelFor(entry.Starting_Academic_Period_Type);
  const where = `${subjectCode}|${courseNumber}`;
  const enrollment = parseCapacityPair(entry.Enrolled_Capacity, `${where} enrollment`, log);
  const waitlist = parseCapacityPair(entry.Waitlist_Waitlist_Capacity, `${where} waitlist`, log);

  return {
    subjectCode,
    courseNumber,
    courseName: courseNameFrom(entry, sectionAndTitle),
    sectionNumber: sectionNumberFrom(sectionAndTitle, { isSpecial, isInterestList, termLabel }),
    termLabel,
    terms: parseTerms(termLabel),
    meetingType: meetingTypeFor(entry.Instructional_Format),
    instructor: instructorFor(entry, isInterestList),
    clusterId: entry.CF_LRV_Cluster_Ref_ID.trim(),
    credits: parseCredits(entry.Credits, where, log),
    seats: enrollment.total,
    seatsAvailable: enrollment.total - enrollment.used,
    actualWaitlist: waitlist.used,
    maxWaitlist: waitlist.total,
    description: htmlToPlainText(entry.Course_Description),
    isSpecial,
    isInterestList,
    raw: entry,
  };
}

/**
 * The section label students see.
 *
 * Three shapes, in the order they are tested:
 * - an interest list is labelled by its term, since all of them are equivalent;
 * - a special-topics section keeps its title, because "HU 3900-A01" alone does
 *   not say which seminar it is;
 * - everything else is the plain "A01" that precedes the title.
 *
 * A trailing parenthetical ("DX02 (group 1)") is dropped either way — it is
 * registrar bookkeeping and it breaks the combined "AL01/AX01" labels.
 */
function sectionNumberFrom(
  sectionAndTitle: string,
  context: { isSpecial: boolean; isInterestList: boolean; termLabel: string },
): string {
  if (context.isInterestList) return `Interest List-${context.termLabel}`;

  const label = context.isSpecial ? sectionAndTitle : sectionAndTitle.split(' - ')[0];
  return dropTrailingParenthetical(label).trim();
}

function dropTrailingParenthetical(label: string): string {
  const parenthesisIndex = label.indexOf('(');
  return parenthesisIndex < 0 ? label : label.slice(0, parenthesisIndex);
}

/**
 * Course title, preferring `Course_Title` and falling back to the title half of
 * `Course_Section` when Workday leaves the former blank.
 */
function courseNameFrom(entry: ReportEntry, sectionAndTitle: string): string {
  const separatorIndex = entry.Course_Title.indexOf(' - ');
  if (separatorIndex >= 0) return entry.Course_Title.slice(separatorIndex + 3).trim();

  const sectionSeparatorIndex = sectionAndTitle.indexOf(' - ');
  if (sectionSeparatorIndex >= 0) return sectionAndTitle.slice(sectionSeparatorIndex + 3).trim();

  return entry.Course_Title.trim();
}

/**
 * `Starting_Academic_Period_Type` -> the app's part-of-term label.
 *
 * Semester-long courses arrive as "Fall" / "Spring" and span two terms; the
 * quarter terms already name themselves.
 */
export function termLabelFor(startingAcademicPeriodType: string): string {
  if (startingAcademicPeriodType === 'Fall') return 'A Term, B Term';
  if (startingAcademicPeriodType === 'Spring') return 'C Term, D Term';
  return startingAcademicPeriodType;
}

/** Workday's `Instructional_Format` under the name the planner shows. */
export function meetingTypeFor(instructionalFormat: string): string {
  return instructionalFormat === 'Laboratory' ? 'Lab' : instructionalFormat;
}

function instructorFor(entry: ReportEntry, isInterestList: boolean): string {
  if (isInterestList) return INTEREST_LIST_INSTRUCTOR;

  const instructors = entry.Instructors.trim();
  return instructors === '' ? UNASSIGNED_INSTRUCTOR : instructors;
}

/**
 * Split a Workday "used/total" pair, e.g. "16/25" or "1/9".
 *
 * @returns Both halves; zeroes when the field was empty or malformed
 */
export function parseCapacityPair(
  rawPair: string,
  where: string,
  log: AnomalyLog,
): { used: number; total: number } {
  const [usedText, totalText, ...extra] = rawPair.split('/');
  const used = Number(usedText);
  const total = Number(totalText);

  if (extra.length > 0 || !Number.isFinite(used) || !Number.isFinite(total)) {
    log.add('unparsable-capacity', where, `Expected "used/total", got ${JSON.stringify(rawPair)}.`);
    return { used: 0, total: 0 };
  }
  return { used, total };
}

function parseCredits(rawCredits: string, where: string, log: AnomalyLog): number {
  const credits = Number(rawCredits);
  if (Number.isFinite(credits)) return credits;

  log.add('unparsable-credits', where, `Credits ${JSON.stringify(rawCredits)} is not a number.`);
  return 0;
}
