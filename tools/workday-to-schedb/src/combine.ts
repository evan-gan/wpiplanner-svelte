/**
 * Lecture + discussion + lab -> the single section a student registers for.
 *
 * Workday publishes each component of a course as its own row: CS 1004 has a
 * lecture "AL01" and four conference sections "AX01".."AX04". The planner has
 * always shown the registrable combinations instead — "AL01/AX01", "AL01/AX02"
 * — because a student who picks the lecture must also pick a conference, and the
 * scheduler has to know both meeting times together.
 *
 * A combination is emitted only when its components are compatible: they must
 * belong to the same cluster where clusters are declared, and their meetings
 * must not overlap. Ported from `jsonIN.combiner` / `jsonIN.conflictChecker` in
 * the legacy Java converter; the pairing rules are the part of that tool with no
 * documentation anywhere else, so they are spelled out here.
 */
import type { PeriodJson, TermName } from '../../../src/lib/model/schedb.ts';
import { daysOverlap } from '../../../src/lib/model/days.ts';

/** Instructional formats that pair with one another. Everything else stands alone. */
const LECTURE = 'Lecture';
const DISCUSSION = 'Discussion';
const LAB = 'Lab';

/** One Workday row, ready to be paired with its siblings. */
export interface ComponentSection {
  /** e.g. "AL01", or a full special-topics title. */
  number: string;
  meetingType: string;
  /** Empty when Workday declared no cluster for this component. */
  clusterId: string;
  isSpecial: boolean;
  isInterestList: boolean;
  termLabel: string;
  terms: TermName[];
  seats: number;
  seatsAvailable: number;
  actualWaitlist: number;
  maxWaitlist: number;
  descriptionIndex: number;
  periods: PeriodJson[];
}

/** A registrable section: either one component, or several combined. */
export type CombinedSection = Omit<ComponentSection, 'meetingType' | 'clusterId' | 'isSpecial' | 'isInterestList'>;

/**
 * Reduce one course's components, within one term, to registrable sections.
 *
 * @param components Every Workday row for this course in this term
 * @returns The sections to publish, in lecture-then-component order
 */
export function combineComponents(components: readonly ComponentSection[]): CombinedSection[] {
  const lectures = components.filter((component) => component.meetingType === LECTURE);
  const discussions = components.filter((component) => component.meetingType === DISCUSSION);
  const labs = components.filter((component) => component.meetingType === LAB);
  const standalone = components.filter(
    (component) => ![LECTURE, DISCUSSION, LAB].includes(component.meetingType),
  );

  const sections = standalone.map(toCombined);

  // No lectures to hang them off: publish whatever components exist on their own,
  // which is what courses that are lab-only or seminar-only need.
  if (lectures.length === 0) {
    return [...sections, ...discussions.map(toCombined), ...labs.map(toCombined)];
  }
  if (discussions.length === 0 && labs.length === 0) {
    return [...sections, ...lectures.map(toCombined)];
  }

  for (const lecture of lectures) {
    sections.push(...combinationsForLecture(lecture, discussions, labs));
  }
  return sections;
}

/**
 * Every compatible pairing of one lecture with the course's other components.
 *
 * A special-topics lecture with no cluster is published alone: its siblings are
 * different classes that happen to share a course number, so pairing them would
 * invent sections that do not exist. An interest list is published alone for the
 * same reason.
 */
function combinationsForLecture(
  lecture: ComponentSection,
  discussions: readonly ComponentSection[],
  labs: readonly ComponentSection[],
): CombinedSection[] {
  if (lecture.isInterestList || (lecture.isSpecial && lecture.clusterId === '')) {
    return [toCombined(lecture)];
  }

  const groups = discussions.length > 0 ? [discussions] : [];
  if (labs.length > 0) groups.push(labs);

  return crossProduct([lecture], groups)
    .filter(areCompatible)
    .map(combine);
}

/** Every way of picking one component from each group, prefixed by `base`. */
function crossProduct(
  base: readonly ComponentSection[],
  groups: readonly (readonly ComponentSection[])[],
): ComponentSection[][] {
  let combinations: ComponentSection[][] = [[...base]];

  for (const group of groups) {
    combinations = combinations.flatMap((combination) =>
      group.map((component) => [...combination, component]),
    );
  }
  return combinations;
}

/**
 * Whether these components can be registered for together.
 *
 * Cluster rules first: a special-topics course only combines within one declared
 * cluster, while an ordinary course lets a component with no cluster join any
 * other, but never lets two different clusters mix. Then the meeting times of
 * the components must not overlap.
 */
export function areCompatible(components: readonly ComponentSection[]): boolean {
  return hasConsistentCluster(components) && hasNoTimeConflict(components);
}

function hasConsistentCluster(components: readonly ComponentSection[]): boolean {
  const requireCluster = components[0].isSpecial;
  const clusters = components.map((component) => component.clusterId);

  if (requireCluster) return clusters.every((cluster) => cluster === clusters[0]);

  const declared = clusters.filter((cluster) => cluster !== '');
  return declared.every((cluster) => cluster === declared[0]);
}

/**
 * Compares only each component's first meeting, the way the legacy converter
 * did. Components with several meetings are rare, and widening this would
 * change which sections the catalog contains — see `README.md`.
 */
function hasNoTimeConflict(components: readonly ComponentSection[]): boolean {
  for (let first = 0; first < components.length; first++) {
    for (let second = first + 1; second < components.length; second++) {
      const [firstPeriod] = components[first].periods;
      const [secondPeriod] = components[second].periods;

      if (firstPeriod !== undefined && secondPeriod !== undefined && periodsOverlap(firstPeriod, secondPeriod)) {
        return false;
      }
    }
  }
  return true;
}

function periodsOverlap(one: PeriodJson, other: PeriodJson): boolean {
  const sharesTime = other.startMinutes < one.endMinutes && other.endMinutes > one.startMinutes;
  return sharesTime && daysOverlap(one.days, other.days);
}

/**
 * Merge components into one section.
 *
 * Seats are the tightest of the components, because a student cannot take the
 * lecture without a seat in its lab. Only the last component keeps its full
 * label — for a special-topics course that is where the title lives, and
 * repeating it once per component would make the label unreadable.
 */
function combine(components: readonly ComponentSection[]): CombinedSection {
  const [first] = components;
  const labels = components.map((component, index) =>
    index === components.length - 1 ? component.number : shortLabel(component),
  );

  return {
    number: labels.join('/'),
    termLabel: first.termLabel,
    terms: first.terms,
    seats: Math.min(...components.map((component) => component.seats)),
    seatsAvailable: Math.min(...components.map((component) => component.seatsAvailable)),
    actualWaitlist: Math.min(...components.map((component) => component.actualWaitlist)),
    maxWaitlist: Math.min(...components.map((component) => component.maxWaitlist)),
    descriptionIndex: first.descriptionIndex,
    periods: components.flatMap((component) => component.periods),
  };
}

/** "A01 - ST: Robot Ethics" -> "A01", for every label but the last. */
function shortLabel(component: ComponentSection): string {
  if (!component.isSpecial) return component.number;

  const separatorIndex = component.number.indexOf(' - ');
  return separatorIndex < 0 ? component.number : component.number.slice(0, separatorIndex);
}

function toCombined(component: ComponentSection): CombinedSection {
  const { meetingType, clusterId, isSpecial, isInterestList, ...section } = component;
  return section;
}
