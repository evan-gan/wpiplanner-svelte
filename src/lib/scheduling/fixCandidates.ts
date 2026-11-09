/**
 * Catalog data → the plain {@link FixRequest} the fix search runs on.
 *
 * Every cost is measured against the course's baseline (its section in the
 * schedule on screen, or its checked sections when there is no schedule), so
 * it is worked out here once per candidate and the search itself
 * only adds numbers. Keeping this step on the main thread means the worker
 * receives small, structured-cloneable input and never needs the catalog.
 */
import { distinctProfessors, sectionParts, type SectionPart } from '$lib/model/sectionComponents';
import type { CourseJson, SectionJson } from '$lib/model/schedb';
import type { ChangeCost, FixCandidate, FixCourse, FixRequest } from './fixFinder';
import type { ChosenTimes, GeneratorSection } from './types';

/** Shift charged for a meeting kind the old section did not have at all. */
const UNMATCHED_PART_SHIFT = 60;
/** Shift charged per weekday gained or lost, so a day change outweighs a small time nudge. */
const SHIFT_PER_CHANGED_DAY = 30;

export function toGeneratorSection(courseId: string, section: SectionJson): GeneratorSection {
  return {
    id: section.id,
    courseId,
    terms: section.terms,
    periods: section.periods.map((period) => ({
      days: period.days,
      startMinutes: period.startMinutes,
      endMinutes: period.endMinutes,
    })),
  };
}

/** The lecture's professors, sorted so two sections can be compared directly. */
export function lectureProfessors(section: SectionJson): string[] {
  const lead = sectionParts(section).find((part) => part.isLead);
  return lead === undefined ? [] : distinctProfessors(lead.periods).sort();
}

function sameList(names: readonly string[], others: readonly string[]): boolean {
  return names.length === others.length && names.every((name, index) => name === others[index]);
}

function countBits(mask: number): number {
  let count = 0;
  for (let rest = mask; rest !== 0; rest &= rest - 1) count++;
  return count;
}

/** How far a meeting kind moved, against the part of the same type in the old section. */
function partShift(part: SectionPart, oldParts: readonly SectionPart[]): number {
  const match = oldParts.find((oldPart) => oldPart.type === part.type);
  if (match === undefined) return UNMATCHED_PART_SHIFT;
  if (match.number === part.number) return 0;

  const [newPeriod] = part.periods;
  const [oldPeriod] = match.periods;
  return (
    Math.abs(newPeriod.startMinutes - oldPeriod.startMinutes) +
    SHIFT_PER_CHANGED_DAY * countBits(newPeriod.days ^ oldPeriod.days)
  );
}

/**
 * What moving a course from `current` to `candidate` costs.
 *
 * @param ignoredPart For the pinned course: the component the student asked
 *   for. Its change is the request itself, so only the course's *other* parts
 *   (a lab that must move with it) are charged, and never as a moved course.
 */
export function changeCost(
  candidate: SectionJson,
  current: SectionJson,
  unchecked: boolean,
  ignoredPart?: string,
): ChangeCost {
  const oldParts = sectionParts(current);
  const timeShift = sectionParts(candidate)
    .filter((part) => part.number !== ignoredPart)
    .reduce((total, part) => total + partShift(part, oldParts), 0);

  if (ignoredPart !== undefined) {
    return { moved: false, newProf: false, termMove: false, timeShift, unchecked };
  }

  return {
    moved: candidate.id !== current.id,
    newProf: !sameList(lectureProfessors(candidate), lectureProfessors(current)),
    termMove: !sameList([...candidate.terms].sort(), [...current.terms].sort()),
    timeShift,
    unchecked,
  };
}

/**
 * Of a course's baseline sections, the one a candidate is measured against:
 * itself if it is one, else the closest — same lecturer first, then same
 * terms, then the smallest time shift.
 *
 * With a schedule on screen the baseline is that one section. Without one it
 * is every section the student has checked, so taking any of them is no change
 * at all, and a new prof only counts when no checked section has that prof.
 *
 * @param baseline Never empty
 * @param ignoredPart As in {@link changeCost}
 */
export function nearestBaseline(
  candidate: SectionJson,
  baseline: readonly SectionJson[],
  ignoredPart?: string,
): SectionJson {
  if (baseline.some((section) => section.id === candidate.id)) return candidate;

  const rank = (section: SectionJson) => {
    const cost = changeCost(candidate, section, false, ignoredPart);
    return [cost.newProf ? 1 : 0, cost.termMove ? 1 : 0, cost.timeShift];
  };
  let best = baseline[0];
  let bestRank = rank(best);
  for (const section of baseline.slice(1)) {
    const sectionRank = rank(section);
    const better = sectionRank.findIndex((value, index) => value !== bestRank[index]);
    if (better !== -1 && sectionRank[better] < bestRank[better]) {
      best = section;
      bestRank = sectionRank;
    }
  }
  return best;
}

export interface FixCourseInput {
  course: CourseJson;
  /**
   * What counts as "no change" for this course: its section in the schedule on
   * screen, or — when no schedule exists — every section the student checked.
   */
  baselineSectionIds: readonly string[];
  isDenied: (sectionId: string) => boolean;
}

export interface FixRequestInput {
  pinned: FixCourseInput & {
    /** The lecture/lab/discussion label the student asked for, e.g. "AL02". */
    componentNumber: string;
    /** Every combined section containing that component. */
    componentSectionIds: readonly string[];
  };
  /** Every other course taking part in the search. */
  others: readonly FixCourseInput[];
  chosenTimes: ChosenTimes;
}

/** Resolve baseline ids to sections, failing loudly on an id from another catalog. */
export function baselineSections(course: CourseJson, baselineSectionIds: readonly string[]): SectionJson[] {
  if (baselineSectionIds.length === 0) {
    throw new Error(`Course ${course.id} has no baseline section; leave it out of the fix search instead.`);
  }
  return baselineSectionIds.map((sectionId) => {
    const section = course.sections.find((candidate) => candidate.id === sectionId);
    if (section === undefined) {
      throw new Error(
        `Section ${sectionId} is not in course ${course.id}; ` +
          'the schedule on screen must come from the current catalog.',
      );
    }
    return section;
  });
}

function buildFixCourse(
  input: FixCourseInput,
  sections: readonly SectionJson[],
  ignoredPart?: string,
): FixCourse {
  const baseline = baselineSections(input.course, input.baselineSectionIds);
  const candidates: FixCandidate[] = sections.map((section) => ({
    section: toGeneratorSection(input.course.id, section),
    cost: changeCost(
      section,
      nearestBaseline(section, baseline, ignoredPart),
      input.isDenied(section.id),
      ignoredPart,
    ),
  }));
  return { courseId: input.course.id, candidates };
}

/** Assemble the search input for one pinned component against each course's baseline. */
export function buildFixRequest(input: FixRequestInput): FixRequest {
  const componentIds = new Set(input.pinned.componentSectionIds);
  const pinnedSections = input.pinned.course.sections.filter((section) => componentIds.has(section.id));

  return {
    pinnedCourse: buildFixCourse(input.pinned, pinnedSections, input.pinned.componentNumber),
    otherCourses: input.others.map((other) => buildFixCourse(other, other.course.sections)),
    chosenTimes: input.chosenTimes,
  };
}
