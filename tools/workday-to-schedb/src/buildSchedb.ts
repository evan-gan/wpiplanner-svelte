/**
 * Workday feed -> the `schedb.json` the app loads.
 *
 * The feed is a flat list of section rows; the app wants a department → course →
 * section → period tree. This module does the grouping, delegating the parsing
 * of a single row to `parseEntry.ts` and the lecture/lab pairing to `combine.ts`.
 */
import {
  SCHEDB_FORMAT_VERSION,
  type CourseJson,
  type DepartmentJson,
  type SchedbFile,
  type SectionJson,
} from '../../../src/lib/model/schedb.ts';
import { DescriptionPool } from '../../shared/descriptionPool.ts';
import { combineComponents, type ComponentSection } from './combine.ts';
import { DEPARTMENT_NAMES, departmentForSubject, isKnownSubject } from './departments.ts';
import {
  detectAcademicYear,
  formatAcademicYearHeader,
  isPlannableEntry,
  offeringPeriodsFor,
  type AcademicYear,
  type ReportEntry,
} from './feed.ts';
import { parseEntry, type ParsedEntry } from './parseEntry.ts';
import { parsePeriods } from './periods.ts';
import { AnomalyLog, type ConversionStats } from './report.ts';

/** The scheduling grid the app draws is half-hour blocks. */
const MINUTES_PER_BLOCK = 30;

/** The feed no longer publishes `cour_sec_def_referenceID`, so there is no CRN. */
const NO_CRN = '';

export interface ConversionResult {
  data: SchedbFile;
  academicYear: AcademicYear;
  /** Line 1 of `yearHeader.txt`, e.g. "2026 - 2027 Academic Year". */
  yearHeaderLine: string;
  stats: ConversionStats;
  anomalies: AnomalyLog;
}

export interface ConversionOptions {
  /** When the feed was last modified upstream; shown in the app header. */
  generated: string;
}

/**
 * Convert the whole feed.
 *
 * @param entries Every row of `Report_Entry`, unfiltered
 * @param options Values that come from outside the feed body
 */
export function buildSchedb(
  entries: readonly ReportEntry[],
  options: ConversionOptions,
): ConversionResult {
  const academicYear = detectAcademicYear(entries);
  const validOfferingPeriods = offeringPeriodsFor(academicYear);
  const log = new AnomalyLog();

  const plannable = entries.filter((entry) => isPlannableEntry(entry, validOfferingPeriods));
  const parsed = plannable
    .map((entry) => parseEntry(entry, log))
    .filter((entry): entry is ParsedEntry => entry !== null);

  const builder = new CatalogBuilder(log);
  for (const [, rowsForCourseTerm] of groupByCourseTerm(parsed)) {
    builder.addCourseTerm(rowsForCourseTerm);
  }

  const departments = builder.departments();
  if (departments.length === 0) {
    throw new Error(
      `None of the ${entries.length} feed rows fell inside the ${formatAcademicYearHeader(academicYear)}; ` +
        'nothing was converted.',
    );
  }

  return {
    data: {
      formatVersion: SCHEDB_FORMAT_VERSION,
      generated: options.generated,
      minutesPerBlock: MINUTES_PER_BLOCK,
      descriptions: builder.descriptions(),
      departments,
    },
    academicYear,
    yearHeaderLine: formatAcademicYearHeader(academicYear),
    stats: builder.stats(entries.length, plannable.length),
    anomalies: log,
  };
}

/**
 * Bucket rows by course and term.
 *
 * Components only combine with siblings in the same term — CS 1004's A-term
 * lecture must not pair with its D-term conference — and the map preserves
 * insertion order, so the output follows the feed's own ordering.
 */
function groupByCourseTerm(entries: readonly ParsedEntry[]): Map<string, ParsedEntry[]> {
  const groups = new Map<string, ParsedEntry[]>();

  for (const entry of entries) {
    const key = `${entry.subjectCode}|${entry.courseNumber}|${entry.termLabel}`;
    const existing = groups.get(key);

    if (existing === undefined) groups.set(key, [entry]);
    else existing.push(entry);
  }
  return groups;
}

/**
 * Accumulates departments, courses, and the description pool across the run.
 *
 * A class rather than a chain of functions because the pool, the anomaly log,
 * and the by-id indexes are all shared by every step, and threading four
 * accumulators through each call obscured what the steps actually do.
 */
class CatalogBuilder {
  private readonly pool = new DescriptionPool();
  private readonly departmentsByAbbrev = new Map<string, DepartmentJson>();
  private readonly coursesById = new Map<string, CourseJson>();
  private readonly sectionIds = new Set<string>();
  /**
   * Courses whose title, credits, and description came from an interest-list
   * row. Those rows carry a placeholder "0" credits and no meeting information,
   * so they are overwritten as soon as a real section of the course turns up.
   */
  private readonly coursesDescribedByInterestList = new Set<string>();
  private readonly reportedUnknownSubjects = new Set<string>();
  private periodCount = 0;

  private readonly log: AnomalyLog;

  constructor(log: AnomalyLog) {
    this.log = log;
  }

  /** Add every row for one course in one term, combined into registrable sections. */
  addCourseTerm(rows: readonly ParsedEntry[]): void {
    // An interest-list row carries no credits and no title of its own, so the
    // course's details come from a real section wherever one exists.
    const course = this.requireCourse(rows.find((row) => !row.isInterestList) ?? rows[0]);
    const components = rows.map((row) => this.toComponent(row, course));

    for (const combined of combineComponents(components)) {
      const id = `${course.id}|${combined.number}`;

      if (this.sectionIds.has(id)) {
        this.log.add('duplicate-section-id', id, 'A section with this label already exists; dropped.');
        continue;
      }
      this.sectionIds.add(id);

      const section: SectionJson = { id, crn: NO_CRN, ...combined };
      course.sections.push(section);
      this.periodCount += section.periods.length;
    }
  }

  /** Departments in the order `departments.ts` lists them, empty ones omitted. */
  departments(): DepartmentJson[] {
    return [...DEPARTMENT_NAMES.keys()]
      .map((abbrev) => this.departmentsByAbbrev.get(abbrev))
      .filter((department): department is DepartmentJson => department !== undefined);
  }

  descriptions(): string[] {
    return this.pool.toArray();
  }

  stats(feedRows: number, plannableRows: number): ConversionStats {
    const departments = this.departments();
    const courses = departments.reduce((total, department) => total + department.courses.length, 0);
    const sections = departments.reduce(
      (total, department) =>
        total + department.courses.reduce((sum, course) => sum + course.sections.length, 0),
      0,
    );

    return {
      feedRows,
      plannableRows,
      departments: departments.length,
      courses,
      sections,
      periods: this.periodCount,
      uniqueDescriptions: this.pool.toArray().length,
      pooledDescriptionBytes: this.pool.byteLength,
    };
  }

  /**
   * The course a row belongs to, created on first sight.
   *
   * Course-level values come from whichever row is seen first. Workday repeats
   * them on every row of the course, so any row would do.
   */
  private requireCourse(row: ParsedEntry): CourseJson {
    const department = this.requireDepartment(row);
    const id = `${department.abbrev}|${row.courseNumber}`;
    const existing = this.coursesById.get(id);

    if (existing !== undefined) {
      this.upgradeFromInterestList(existing, row);
      return existing;
    }

    const course: CourseJson = {
      id,
      number: row.courseNumber,
      name: row.courseName,
      minCredits: row.credits,
      maxCredits: row.credits,
      descriptionIndex: this.pool.intern(row.description),
      sections: [],
    };
    if (row.isInterestList) this.coursesDescribedByInterestList.add(id);

    this.coursesById.set(id, course);
    department.courses.push(course);
    return course;
  }

  /** Replace placeholder course details once a real section of the course is seen. */
  private upgradeFromInterestList(course: CourseJson, row: ParsedEntry): void {
    if (row.isInterestList || !this.coursesDescribedByInterestList.has(course.id)) return;

    course.name = row.courseName;
    course.minCredits = row.credits;
    course.maxCredits = row.credits;
    course.descriptionIndex = this.pool.intern(row.description);
    this.coursesDescribedByInterestList.delete(course.id);
  }

  private requireDepartment(row: ParsedEntry): DepartmentJson {
    if (!isKnownSubject(row.subjectCode) && !this.reportedUnknownSubjects.has(row.subjectCode)) {
      this.reportedUnknownSubjects.add(row.subjectCode);
      this.log.add(
        'unknown-subject',
        row.subjectCode,
        `Subject code "${row.subjectCode}" is not in departments.ts; its courses were filed under "Other".`,
      );
    }

    const { abbrev, name } = departmentForSubject(row.subjectCode);
    const existing = this.departmentsByAbbrev.get(abbrev);
    if (existing !== undefined) return existing;

    const department: DepartmentJson = { abbrev, name, courses: [] };
    this.departmentsByAbbrev.set(abbrev, department);
    return department;
  }

  /**
   * One row as a combinable component.
   *
   * The section description is dropped when it repeats the course's, which is
   * the common case now that the feed publishes a single `Course_Description`
   * per row — the app falls back to the course text when a section has none.
   */
  private toComponent(row: ParsedEntry, course: CourseJson): ComponentSection {
    const where = `${course.id}|${row.sectionNumber}`;
    const periodContext = {
      type: row.meetingType,
      professor: row.instructor,
      sectionNumber: row.sectionNumber,
      seats: row.seats,
      seatsAvailable: row.seatsAvailable,
      actualWaitlist: row.actualWaitlist,
      maxWaitlist: row.maxWaitlist,
    };

    const courseDescription = this.pool.toArray()[course.descriptionIndex] ?? '';
    const descriptionIndex = saysTheSameThing(row.description, courseDescription)
      ? -1
      : this.pool.intern(row.description);

    return {
      number: row.sectionNumber,
      meetingType: row.meetingType,
      clusterId: row.clusterId,
      isSpecial: row.isSpecial,
      isInterestList: row.isInterestList,
      termLabel: row.termLabel,
      terms: row.terms,
      seats: row.seats,
      seatsAvailable: row.seatsAvailable,
      actualWaitlist: row.actualWaitlist,
      maxWaitlist: row.maxWaitlist,
      descriptionIndex,
      periods: parsePeriods(row.raw.Section_Details, periodContext, where, this.log),
    };
  }
}

/**
 * Whether two descriptions carry the same words.
 *
 * Workday's HTML is inconsistent about `<br />` between sentences, so the same
 * blurb arrives as both "Cat. IThis course" and "Cat. I This course". Comparing
 * letters and digits alone keeps a section from repeating its course's text on
 * screen over a markup difference. The stored text is untouched.
 */
function saysTheSameThing(one: string, other: string): boolean {
  const letters = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  return letters(one) === letters(other);
}
