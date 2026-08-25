import {
  SCHEDB_FORMAT_VERSION,
  type CourseJson,
  type DepartmentJson,
  type PeriodJson,
  type SchedbFile,
  type SectionJson,
} from '../../../src/lib/model/schedb.ts';
import { optionalNumber, optionalText, requireInteger, requireText, type Attributes } from './attributes.ts';
import { parseDayMask } from './days.ts';
import { DescriptionPool } from './descriptionPool.ts';
import { AnomalyLog, type ConversionStats } from './report.ts';
import { parseTerms } from './terms.ts';
import { parseClockTime } from './time.ts';

export interface ConversionResult {
  data: SchedbFile;
  stats: ConversionStats;
  anomalies: AnomalyLog;
}

const KNOWN_ELEMENTS = new Set(['schedb', 'dept', 'course', 'section', 'period']);

/** Minutes past midnight at which a start time is treated as a midnight artifact. */
const MIDNIGHT_MINUTES = 0;

/**
 * Walk the scanned tag stream and build the JSON document.
 *
 * Kept as a class so the four element handlers can share the current
 * department/course/section context without threading it through every call,
 * while each handler stays small enough to read on its own.
 */
export class SchedbBuilder {
  private readonly pool = new DescriptionPool();
  private readonly log = new AnomalyLog();
  private readonly departments: DepartmentJson[] = [];
  /** Maps CRN to the first section id that claimed it, to detect cross-listings. */
  private readonly crnOwners = new Map<string, string>();

  private generated = '';
  private minutesPerBlock = 30;
  private periodCount = 0;

  private currentDepartment: DepartmentJson | null = null;
  private currentCourse: CourseJson | null = null;
  private currentSection: SectionJson | null = null;

  openElement(name: string, attributes: Attributes): void {
    switch (name) {
      case 'schedb':
        return this.readRoot(attributes);
      case 'dept':
        return this.openDepartment(attributes);
      case 'course':
        return this.openCourse(attributes);
      case 'section':
        return this.openSection(attributes);
      case 'period':
        return this.readPeriod(attributes);
      default:
        throw new Error(
          `Unexpected element <${name}>; expected one of ${[...KNOWN_ELEMENTS].join(', ')}. ` +
            `The upstream export format may have changed.`,
        );
    }
  }

  closeElement(name: string): void {
    if (name === 'dept') this.currentDepartment = null;
    if (name === 'course') this.currentCourse = null;
    if (name === 'section') this.currentSection = null;
  }

  finish(): ConversionResult {
    if (this.departments.length === 0) {
      throw new Error('The source document contained no <dept> elements; nothing was converted.');
    }

    const data: SchedbFile = {
      formatVersion: SCHEDB_FORMAT_VERSION,
      generated: this.generated,
      minutesPerBlock: this.minutesPerBlock,
      descriptions: this.pool.toArray(),
      departments: this.departments,
    };

    return { data, stats: this.buildStats(), anomalies: this.log };
  }

  private buildStats(): ConversionStats {
    const courses = this.departments.reduce((total, dept) => total + dept.courses.length, 0);
    const sections = this.departments.reduce(
      (total, dept) => total + dept.courses.reduce((sum, course) => sum + course.sections.length, 0),
      0,
    );

    return {
      departments: this.departments.length,
      courses,
      sections,
      periods: this.periodCount,
      uniqueDescriptions: this.pool.toArray().length,
      pooledDescriptionBytes: this.pool.byteLength,
    };
  }

  private readRoot(attributes: Attributes): void {
    this.generated = requireText(attributes, 'generated', '<schedb>');
    this.minutesPerBlock = requireInteger(attributes, 'minutes-per-block', '<schedb>');
  }

  private openDepartment(attributes: Attributes): void {
    const abbrev = requireText(attributes, 'abbrev', '<dept>');

    this.currentDepartment = {
      abbrev,
      name: requireText(attributes, 'name', `<dept ${abbrev}>`),
      courses: [],
    };
    this.departments.push(this.currentDepartment);
  }

  private openCourse(attributes: Attributes): void {
    const department = this.requireContext(this.currentDepartment, 'course', 'dept');
    const number = requireText(attributes, 'number', `<course> in ${department.abbrev}`);
    const id = `${department.abbrev}|${number}`;

    this.currentCourse = {
      id,
      number,
      name: requireText(attributes, 'name', id),
      minCredits: optionalNumber(attributes, 'min-credits', 0),
      maxCredits: optionalNumber(attributes, 'max-credits', 0),
      descriptionIndex: this.pool.intern(optionalText(attributes, 'course_desc')),
      sections: [],
    };
    department.courses.push(this.currentCourse);
  }

  private openSection(attributes: Attributes): void {
    const course = this.requireContext(this.currentCourse, 'section', 'course');
    const number = requireText(attributes, 'number', `<section> in ${course.id}`);
    const id = `${course.id}|${number}`;
    const termLabel = requireText(attributes, 'part-of-term', id);
    const crn = requireText(attributes, 'crn', id);

    this.noteCrn(crn, id);

    this.currentSection = {
      id,
      crn,
      number,
      termLabel,
      terms: parseTerms(termLabel),
      seats: requireInteger(attributes, 'seats', id),
      seatsAvailable: requireInteger(attributes, 'availableseats', id),
      actualWaitlist: requireInteger(attributes, 'actual_waitlist', id),
      maxWaitlist: requireInteger(attributes, 'max_waitlist', id),
      descriptionIndex: this.pool.intern(optionalText(attributes, 'sec_desc')),
      periods: [],
    };
    course.sections.push(this.currentSection);
  }

  private readPeriod(attributes: Attributes): void {
    const section = this.requireContext(this.currentSection, 'period', 'section');
    const where = `${section.id} period ${section.periods.length + 1}`;

    const period: PeriodJson = {
      type: optionalText(attributes, 'type'),
      professor: optionalText(attributes, 'professor').trim(),
      days: parseDayMask(optionalText(attributes, 'days')),
      startMinutes: parseClockTime(requireText(attributes, 'starts', where)),
      endMinutes: parseClockTime(requireText(attributes, 'ends', where)),
      location: buildLocation(attributes),
      seats: requireInteger(attributes, 'seats', where),
      seatsAvailable: requireInteger(attributes, 'availableseats', where),
      actualWaitlist: requireInteger(attributes, 'actual_waitlist', where),
      maxWaitlist: requireInteger(attributes, 'max_waitlist', where),
      sectionNumber: optionalText(attributes, 'section', section.number),
    };

    this.notePeriodAnomalies(period, where);
    section.periods.push(period);
    this.periodCount++;
  }

  private notePeriodAnomalies(period: PeriodJson, where: string): void {
    if (period.days === 0) {
      this.log.add('unknown-days', where, 'Source listed days as "?"; period cannot be placed on the grid.');
    }
    if (period.endMinutes < period.startMinutes) {
      this.log.add('end-before-start', where, `Ends ${period.endMinutes} before it starts ${period.startMinutes}.`);
    } else if (period.endMinutes === period.startMinutes) {
      this.log.add('zero-length-period', where, 'Start and end times are identical.');
    }
    if (period.startMinutes === MIDNIGHT_MINUTES) {
      this.log.add('midnight-hour', where, 'Period starts at 12:00AM, which usually means a missing time.');
    }
    if (period.location === '') {
      this.log.add('empty-location', where, 'Neither building nor room was provided.');
    }
  }

  private noteCrn(crn: string, sectionId: string): void {
    const owner = this.crnOwners.get(crn);
    if (owner === undefined) {
      this.crnOwners.set(crn, sectionId);
      return;
    }
    this.log.add(
      'duplicate-crn',
      sectionId,
      `CRN ${crn} is already used by ${owner} (cross-listed course). Use the section id, not the CRN, as a key.`,
    );
  }

  private requireContext<T>(value: T | null, child: string, parent: string): T {
    if (value === null) {
      throw new Error(`Found <${child}> outside of a <${parent}> element; the document is malformed.`);
    }
    return value;
  }
}

/**
 * Join the building and room attributes into one display string.
 *
 * Workday exports leave `building` empty and put the full location in `room`
 * (e.g. "Olin Hall 126 "), so this collapses whitespace rather than assuming a
 * `${building}${room}` concatenation the way the GWT parser did.
 */
function buildLocation(attributes: Attributes): string {
  const building = optionalText(attributes, 'building');
  const room = optionalText(attributes, 'room');

  return `${building} ${room}`.replace(/\s+/g, ' ').trim();
}
