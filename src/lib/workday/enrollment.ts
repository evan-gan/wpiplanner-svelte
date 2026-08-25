/**
 * Turns the rows of Workday's "View My Courses" export into enrolled courses.
 *
 * Workday lists one row per *meeting* — a lecture and its lab are two rows of
 * the same course — while the catalog stores that pair as one section whose id
 * joins both labels, `CS|1102|AL01/AX01`. So the rows are grouped back into one
 * record per course-and-term carrying the set of section labels the student is
 * in, which is what `matchEnrollment` then matches against the catalog.
 *
 * Columns are located by their header text rather than by letter, so Workday
 * reordering or inserting a column does not silently shift the data.
 */
import type { SheetRows } from './xlsx';

/** One course the student is enrolled in, with every section label it involves. */
export interface EnrolledCourse {
  /** Department abbreviation as the catalog spells it, e.g. `CS`. */
  deptAbbrev: string;
  /** Course number as the catalog spells it, e.g. `1102`. */
  courseNumber: string;
  /** Course title as Workday printed it, for the import summary. */
  title: string;
  /** Workday's term text, e.g. `2026 Fall A Term`. Empty when it could not be read. */
  termText: string;
  /** Section labels, in sheet order — e.g. `['AL01', 'AX01']`. */
  sectionNumbers: string[];
}

/** Headers that must be present; anything else in the sheet is ignored. */
const COURSE_LISTING_HEADER = 'course listing';
const SECTION_HEADER = 'section';
const REGISTRATION_STATUS_HEADER = 'registration status';

/**
 * Workday's term text is the tail of the long first column, after the last
 * " - ": `... - CS 1102 - Accelerated Introduction To Program Design - 2026 Fall A Term`.
 */
const TERM_TEXT_PATTERN = /-\s*([^-]*(?:Term|Semester))\s*$/i;

/** `CS 1102 - Accelerated Introduction To Program Design` */
const COURSE_LISTING_PATTERN = /^\s*([A-Za-z]{2,6})\s+([0-9]{3,4}[A-Za-z]*)\s*(?:-\s*(.*))?$/;

/** `MA 1024-BD09 (group 10)`, once the title has been cut off. */
const SECTION_LABEL_PATTERN = /-\s*([A-Za-z0-9]+)\s*$/;

/**
 * Group an exported sheet into the courses the student is enrolled in.
 *
 * @param rows The first worksheet, as returned by `readFirstSheet`
 * @returns One record per course-and-term, in the order the sheet lists them
 * @throws Error when the sheet has no recognisable Workday header row
 */
export function parseEnrolledCourses(rows: SheetRows): EnrolledCourse[] {
  const header = findHeaderRow(rows);
  const grouped = new Map<string, EnrolledCourse>();

  for (const row of rows.slice(header.rowIndex + 1)) {
    const course = parseCourseRow(row, header);
    if (course === undefined) continue;

    const key = `${course.deptAbbrev}|${course.courseNumber}|${course.termText}`;
    const existing = grouped.get(key);

    if (existing === undefined) {
      grouped.set(key, course);
    } else if (!existing.sectionNumbers.includes(course.sectionNumbers[0])) {
      existing.sectionNumbers.push(course.sectionNumbers[0]);
    }
  }

  return [...grouped.values()];
}

interface HeaderRow {
  rowIndex: number;
  courseListingColumn: number;
  sectionColumn: number;
  registrationStatusColumn: number;
}

/**
 * Locate the header row and the columns the import reads.
 *
 * Workday puts a title and a merged banner above the real header, so the header
 * is found by content — the row that carries both "Course Listing" and
 * "Section" — rather than at a fixed index.
 */
function findHeaderRow(rows: SheetRows): HeaderRow {
  for (const [rowIndex, row] of rows.entries()) {
    // Rows built by hand can be sparse; the sheet reader's own rows never are.
    const headings = row.map((cell) => (cell ?? '').trim().toLowerCase());

    const courseListingColumn = headings.indexOf(COURSE_LISTING_HEADER);
    const sectionColumn = headings.indexOf(SECTION_HEADER);
    if (courseListingColumn === -1 || sectionColumn === -1) continue;

    return {
      rowIndex,
      courseListingColumn,
      sectionColumn,
      registrationStatusColumn: headings.indexOf(REGISTRATION_STATUS_HEADER),
    };
  }

  throw new Error(
    'That workbook does not look like a Workday "View My Courses" export: no row has both ' +
      'a "Course Listing" and a "Section" column. Use the Export to Excel button on the ' +
      'View My Courses screen in Workday.',
  );
}

/** One sheet row as a single-section course, or undefined when it is not a course row. */
function parseCourseRow(row: string[], header: HeaderRow): EnrolledCourse | undefined {
  if (isDropped(row, header)) return undefined;

  const listing = COURSE_LISTING_PATTERN.exec(row[header.courseListingColumn] ?? '');
  if (listing === null) return undefined;

  const sectionNumber = parseSectionNumber(row[header.sectionColumn] ?? '');
  if (sectionNumber === undefined) return undefined;

  const [, deptAbbrev, courseNumber, title] = listing;

  return {
    deptAbbrev: deptAbbrev.toUpperCase(),
    courseNumber: courseNumber.toUpperCase(),
    title: (title ?? '').trim(),
    termText: TERM_TEXT_PATTERN.exec(row[0] ?? '')?.[1].trim() ?? '',
    sectionNumbers: [sectionNumber],
  };
}

/**
 * Whether a row records a course the student is no longer taking.
 *
 * Only an explicit drop is excluded. A waitlisted or pending row still describes
 * a section the student is trying to take, so it is imported like any other.
 */
function isDropped(row: string[], header: HeaderRow): boolean {
  if (header.registrationStatusColumn === -1) return false;
  return /\bdrop/i.test(row[header.registrationStatusColumn] ?? '');
}

/**
 * Pull the section label out of Workday's section text.
 *
 * The text runs `CS 1102-AL01 - Accelerated Introduction To Program Design`, and
 * some rows carry a `(group 10)` note before the title. Cutting at the first
 * " - " drops the title — which may itself contain hyphens — and the parenthetical
 * is stripped separately.
 */
function parseSectionNumber(sectionText: string): string | undefined {
  const beforeTitle = sectionText.split(' - ')[0] ?? '';
  const withoutGroupNote = beforeTitle.replace(/\([^)]*\)/g, '').trim();

  return SECTION_LABEL_PATTERN.exec(withoutGroupNote)?.[1].toUpperCase();
}
