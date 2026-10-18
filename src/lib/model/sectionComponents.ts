/**
 * Splits a course's registrable sections back into the pieces a student thinks
 * in: the lecture, and the lab / discussion that goes with it.
 *
 * The catalog stores each *combination* as one section (`CS|1102|AL01/AX03`), so
 * a course with one lecture and four labs has four sections that all start
 * `AL01`. Listing those flat makes the student pick the same lecture four times.
 *
 * This is a view and owns no state. A component is "on" while any section
 * containing it is still switched on, so the checkboxes can never disagree
 * with the denied-section list in `SelectionState`. Ticking a lecture on or off
 * applies to all of its sections; labs and discussions are nested under each
 * lecture (`buildLectureEntries`) and toggle only their pairing with it.
 */
import { courseAvailability, type Availability } from './availability.ts';
import { dayMaskToNames } from './days.ts';
import type { CourseJson, DayShortName, PeriodJson, SectionJson, TermName } from './schedb.ts';
import { formatTermLabel, TERM_NAMES } from './terms.ts';
import { formatClockTime } from './time.ts';

/** Workday's stand-ins for "nobody assigned yet", compared lower-cased. */
const PLACEHOLDER_PROFESSORS = new Set(['n/a', 'not assigned', 'staff', 'tba', 'unknown']);

/** Whether a professor name is a placeholder rather than a person. */
export function isPlaceholderProfessor(name: string): boolean {
  return PLACEHOLDER_PROFESSORS.has(name.trim().toLowerCase());
}

/** The meeting type that leads a course; everything else hangs off it. */
const PRIMARY_TYPE = 'Lecture';

export interface SectionComponent {
  /** The label Workday prints for this meeting alone, e.g. "AL01" or "AX03". */
  number: string;
  /** "Lecture", "Lab", "Discussion", ... */
  type: string;
  /** Distinct, non-empty professor names. */
  professors: string[];
  periods: PeriodJson[];
  /** Every combined section of the course that contains this component. */
  sectionIds: string[];
}

export interface SecondaryGroup {
  type: string;
  components: SectionComponent[];
}

export interface CourseComponents {
  /** The lectures (or the first component kind, when a course has no lecture). */
  primary: SectionComponent[];
  /** Labs, discussions, ... one group per meeting type, in first-seen order. */
  secondary: SecondaryGroup[];
  /** Which primary and secondary components each combined section is made of. */
  composition: Map<string, { primary: string; secondary: string[] }>;
}

/** A section's periods grouped by their own label, in the order they appear. */
function periodsByComponent(section: SectionJson): Map<string, PeriodJson[]> {
  const byNumber = new Map<string, PeriodJson[]>();

  for (const period of section.periods) {
    const label = period.sectionNumber || section.number;
    byNumber.set(label, [...(byNumber.get(label) ?? []), period]);
  }

  return byNumber;
}

function distinctProfessors(periods: readonly PeriodJson[]): string[] {
  const names = periods.map((period) => period.professor.trim()).filter((name) => name !== '');
  return [...new Set(names)];
}

/**
 * Break the catalog's sections into lecture and lab/discussion components.
 *
 * A section with a single meeting kind (a lecture-only course) has no
 * secondary components, and the result then needs no second step in the UI.
 */
export function buildCourseComponents(course: CourseJson): CourseComponents {
  const componentsByKey = new Map<string, SectionComponent>();
  const primary: SectionComponent[] = [];
  const secondaryByType = new Map<string, SectionComponent[]>();
  const composition: CourseComponents['composition'] = new Map();

  for (const section of course.sections) {
    const parts = [...periodsByComponent(section)].map(([number, periods]) => ({
      number,
      type: periods[0].type,
      periods,
    }));
    const lead = parts.find((part) => part.type === PRIMARY_TYPE) ?? parts[0];
    if (lead === undefined) continue;

    const secondaryNumbers: string[] = [];

    for (const part of parts) {
      const isLead = part === lead;
      const key = `${isLead ? 'primary' : 'secondary'}|${part.type}|${part.number}`;
      let component = componentsByKey.get(key);

      if (component === undefined) {
        component = {
          number: part.number,
          type: part.type,
          professors: distinctProfessors(part.periods),
          periods: part.periods,
          sectionIds: [],
        };
        componentsByKey.set(key, component);

        if (isLead) {
          primary.push(component);
        } else {
          secondaryByType.set(part.type, [...(secondaryByType.get(part.type) ?? []), component]);
        }
      }

      component.sectionIds.push(section.id);
      if (!isLead) secondaryNumbers.push(part.number);
    }

    composition.set(section.id, { primary: lead.number, secondary: secondaryNumbers });
  }

  return {
    primary,
    secondary: [...secondaryByType].map(([type, components]) => ({ type, components })),
    composition,
  };
}

export type IsSectionDenied = (sectionId: string) => boolean;

/** Whether any section made from this component is still switched on. */
export function isComponentOn(component: SectionComponent, isDenied: IsSectionDenied): boolean {
  return component.sectionIds.some((id) => !isDenied(id));
}

/** One lecture, and the labs/discussions that can be taken with it. */
export interface LectureEntry {
  lecture: SectionComponent;
  /**
   * The lecture's own labs and discussions, grouped by type. Each component's
   * `sectionIds` is cut down to this lecture's sections, so a lab shared by two
   * lectures appears under both and ticking it under one leaves the other alone.
   */
  linked: SecondaryGroup[];
}

/**
 * Nest each lab/discussion under the lectures it can be taken with.
 *
 * A professor teaching two lectures therefore shows up twice, each with the
 * labs that belong to that lecture — which is how a student actually registers.
 */
export function buildLectureEntries(components: CourseComponents): LectureEntry[] {
  return components.primary.map((lecture) => {
    const ownSections = new Set(lecture.sectionIds);

    const linked = components.secondary
      .map((group) => ({
        type: group.type,
        components: group.components
          .map((component) => ({
            ...component,
            sectionIds: component.sectionIds.filter((id) => ownSections.has(id)),
          }))
          .filter((component) => component.sectionIds.length > 0)
          // Catalog order is arbitrary (AX38 before AX02); by label reads like a timetable.
          .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
      }))
      .filter((group) => group.components.length > 0);

    return { lecture, linked };
  });
}

/** Lectures that run in the same term(s), shown together under one divider. */
export interface TermGroup {
  /** Calendar order; more than one for a semester-long lecture. */
  terms: TermName[];
  /** "A-Term", or "A-Term – B-Term" for a lecture spanning both. */
  label: string;
  entries: LectureEntry[];
}

/** The terms a lecture's sections meet in, in calendar order. */
function termsOfEntry(entry: LectureEntry, course: CourseJson): TermName[] {
  const ids = new Set(entry.lecture.sectionIds);
  const found = new Set(
    course.sections.filter((section) => ids.has(section.id)).flatMap((section) => section.terms),
  );
  return TERM_NAMES.filter((term) => found.has(term));
}

/**
 * Split lecture entries into term groups, A before B before C before D.
 *
 * A group spanning several terms sorts after the single-term group of its
 * first term (A, then A–B, then B), so the list still reads in calendar order.
 * Within a group the catalog order is kept.
 */
export function groupEntriesByTerm(entries: readonly LectureEntry[], course: CourseJson): TermGroup[] {
  const groups = new Map<string, TermGroup>();

  for (const entry of entries) {
    const terms = termsOfEntry(entry, course);
    const key = terms.join('');
    let group = groups.get(key);
    if (group === undefined) {
      const label =
        terms.length === 0 ? 'Term TBA' : terms.map((term) => formatTermLabel(term)).join(' – ');
      group = { terms, label, entries: [] };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }

  // Sort key: first term's position, then span length; no terms sorts last.
  const sortKey = (group: TermGroup) =>
    group.terms.length === 0
      ? Number.MAX_SAFE_INTEGER
      : TERM_NAMES.indexOf(group.terms[0]) * 10 + group.terms.length;

  return [...groups.values()].sort((a, b) => sortKey(a) - sortKey(b));
}

/**
 * The sections to switch on or off when a lab/discussion under a lecture is
 * ticked or unticked.
 *
 * Unticking denies that pairing only. Ticking brings back the pairings whose
 * *other* linked components are still on — with a lab and a discussion, ticking
 * lab AX01 must not revive discussion AD02 the student switched off. When no
 * such pairing exists the tick would do nothing, so every pairing returns.
 */
export function sectionsForLinkedToggle(
  components: CourseComponents,
  entry: LectureEntry,
  linkedComponent: SectionComponent,
  turnOn: boolean,
  isDenied: IsSectionDenied,
): string[] {
  if (!turnOn) return linkedComponent.sectionIds;

  // Lab labels (AX01, AD01) are unique within a course, so the label alone is a key.
  const liveNumbers = new Set(
    entry.linked
      .flatMap((group) => group.components)
      .filter((component) => isComponentOn(component, isDenied))
      .map((component) => component.number),
  );

  const withLiveSiblings = linkedComponent.sectionIds.filter((id) => {
    const parts = components.composition.get(id);
    return (
      parts !== undefined &&
      parts.secondary.every((number) => number === linkedComponent.number || liveNumbers.has(number))
    );
  });

  return withLiveSiblings.length > 0 ? withLiveSiblings : linkedComponent.sectionIds;
}

/**
 * Of the sections containing a component, the one that changes the least
 * from `referenceSectionId` (normally the course's section in the schedule on
 * screen).
 *
 * Hovering a discussion previews a whole combined section, so picking any
 * section with that discussion would also swap the lab on the grid. Choosing
 * the one that shares the most other components keeps everything the student
 * is not pointing at where it is. Ties prefer a section that is switched on.
 *
 * @param candidateIds Sections containing the hovered component; never empty
 * @param referenceSectionId The section to stay close to, or undefined if none
 * @returns The chosen section id
 */
export function closestSection(
  components: CourseComponents,
  candidateIds: readonly string[],
  referenceSectionId: string | undefined,
  isDenied: IsSectionDenied,
): string {
  const reference =
    referenceSectionId === undefined ? undefined : components.composition.get(referenceSectionId);

  function sharedWithReference(sectionId: string): number {
    const parts = components.composition.get(sectionId);
    if (reference === undefined || parts === undefined) return 0;
    const primaryMatch = parts.primary === reference.primary ? 1 : 0;
    return primaryMatch + parts.secondary.filter((n) => reference.secondary.includes(n)).length;
  }

  let best = candidateIds[0];
  let bestScore = -1;
  for (const id of candidateIds) {
    // Shared components dominate; being switched on only breaks ties.
    const score = sharedWithReference(id) * 2 + (isDenied(id) ? 0 : 1);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

/** Best availability across the sections a component appears in. */
export function componentAvailability(
  component: SectionComponent,
  course: CourseJson,
): Availability {
  const ids = new Set(component.sectionIds);
  return courseAvailability(course.sections.filter((section) => ids.has(section.id)));
}

/** WPI's one-letter day codes; Thursday is R so it cannot be confused with Tuesday. */
const DAY_LETTERS: Record<DayShortName, string> = {
  sun: 'U',
  mon: 'M',
  tue: 'T',
  wed: 'W',
  thu: 'R',
  fri: 'F',
  sat: 'S',
};

/**
 * One line per distinct meeting pattern, e.g. "MWF 9:00-9:50AM".
 *
 * The start time drops its AM/PM when the end time shares it, as timetables
 * usually print it. Unknown days (the export's "?") read as "Days TBA".
 */
export function describeMeetings(periods: readonly PeriodJson[]): string[] {
  const lines = periods.map((period) => {
    const days = dayMaskToNames(period.days)
      .map((day) => DAY_LETTERS[day])
      .join('');
    const start = formatClockTime(period.startMinutes);
    const end = formatClockTime(period.endMinutes);
    const sameHalf = start.slice(-2) === end.slice(-2);
    const range = `${sameHalf ? start.slice(0, -2) : start}-${end}`;
    return `${days === '' ? 'Days TBA' : days} ${range}`;
  });

  return [...new Set(lines)];
}
