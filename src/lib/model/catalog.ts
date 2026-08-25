/**
 * Indexed view over `schedb.json` — the replacement for the legacy
 * `ScheduleDB` singleton.
 *
 * Two differences that matter:
 *
 * - Lookups are by id (`CS|2102|A01`), not CRN. 149 CRNs in the catalog are
 *   shared by cross-listed sections, so `getSectionByCRN` silently returned
 *   whichever department parsed first.
 * - The JSON stays a plain tree with no parent back-references, so any slice of
 *   it can be structured-cloned into the generator worker. Walking upward from a
 *   section to its course goes through this index instead.
 */
import {
  SCHEDB_FORMAT_VERSION,
  type CourseJson,
  type DepartmentJson,
  type SchedbFile,
  type SectionJson,
} from './schedb.ts';

export interface CatalogCounts {
  departments: number;
  courses: number;
  sections: number;
  periods: number;
}

export class Catalog {
  readonly file: SchedbFile;

  private readonly departmentsByAbbrev = new Map<string, DepartmentJson>();
  private readonly coursesById = new Map<string, CourseJson>();
  private readonly sectionsById = new Map<string, SectionJson>();
  /** section id -> course id, and course id -> department abbrev. */
  private readonly courseIdBySectionId = new Map<string, string>();
  private readonly departmentAbbrevByCourseId = new Map<string, string>();

  readonly counts: CatalogCounts;

  constructor(file: SchedbFile) {
    if (file.formatVersion !== SCHEDB_FORMAT_VERSION) {
      throw new Error(
        `schedb.json has formatVersion ${file.formatVersion}, but this build expects ` +
          `${SCHEDB_FORMAT_VERSION}. Re-run \`pnpm run data:build\`.`,
      );
    }

    this.file = file;
    let sections = 0;
    let periods = 0;
    let courses = 0;

    for (const department of file.departments) {
      this.departmentsByAbbrev.set(department.abbrev, department);

      for (const course of department.courses) {
        courses++;
        this.coursesById.set(course.id, course);
        this.departmentAbbrevByCourseId.set(course.id, department.abbrev);

        for (const section of course.sections) {
          sections++;
          periods += section.periods.length;
          this.sectionsById.set(section.id, section);
          this.courseIdBySectionId.set(section.id, course.id);
        }
      }
    }

    this.counts = { departments: file.departments.length, courses, sections, periods };
  }

  get departments(): readonly DepartmentJson[] {
    return this.file.departments;
  }

  /** Generation timestamp shown in the header, copied from the source export. */
  get generated(): string {
    return this.file.generated;
  }

  getDepartment(abbrev: string): DepartmentJson | undefined {
    return this.departmentsByAbbrev.get(abbrev);
  }

  getCourse(courseId: string): CourseJson | undefined {
    return this.coursesById.get(courseId);
  }

  getSection(sectionId: string): SectionJson | undefined {
    return this.sectionsById.get(sectionId);
  }

  /** Like {@link getSection}, but for callers that treat a miss as a bug. */
  requireSection(sectionId: string): SectionJson {
    const section = this.sectionsById.get(sectionId);
    if (section === undefined) {
      throw new Error(`No section with id ${JSON.stringify(sectionId)} exists in the catalog.`);
    }
    return section;
  }

  requireCourse(courseId: string): CourseJson {
    const course = this.coursesById.get(courseId);
    if (course === undefined) {
      throw new Error(`No course with id ${JSON.stringify(courseId)} exists in the catalog.`);
    }
    return course;
  }

  getCourseOfSection(sectionId: string): CourseJson | undefined {
    const courseId = this.courseIdBySectionId.get(sectionId);
    return courseId === undefined ? undefined : this.coursesById.get(courseId);
  }

  /** The owning course id — cheaper than {@link getCourseOfSection} in hot loops. */
  getCourseIdOfSection(sectionId: string): string | undefined {
    return this.courseIdBySectionId.get(sectionId);
  }

  getDepartmentOfCourse(courseId: string): DepartmentJson | undefined {
    const abbrev = this.departmentAbbrevByCourseId.get(courseId);
    return abbrev === undefined ? undefined : this.departmentsByAbbrev.get(abbrev);
  }

  /** e.g. "CS2102" — the legacy `Course.toAbbreviation()`. */
  courseAbbrev(courseId: string): string {
    const course = this.requireCourse(courseId);
    const abbrev = this.departmentAbbrevByCourseId.get(courseId) ?? '';
    return `${abbrev}${course.number}`;
  }

  /** e.g. "Calculus I (MA1021)" — the legacy `Course.toString()`. */
  courseTitle(courseId: string): string {
    return `${this.requireCourse(courseId).name} (${this.courseAbbrev(courseId)})`;
  }

  /** Resolve a pooled description index; -1 means the source had no text. */
  description(index: number): string {
    if (index < 0 || index >= this.file.descriptions.length) return '';
    return this.file.descriptions[index];
  }
}
