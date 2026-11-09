/**
 * A found fix → what the fix panel prints: tags, change lines, cascade notes.
 *
 * Every card has the same shape so the eye learns it once:
 *
 *   (1 new prof) (2 courses move)                             [Use this]
 *     CS1102  (New prof: Donald Knuth, was Grace Hopper)
 *       Lecture  TR 10am - 10:50am AL01  →  MWF 9am - 9:50am AL04
 *     CS3733
 *       Lecture  MWF 1pm - 1:50pm A01  →  MWF 2pm - 2:50pm A02
 *
 * Tags are plain words in brackets, no colour, and **only name changes**: a
 * new prof, a term move, a new lab/discussion instructor, how many courses
 * move. Anything that stays the same is left unsaid, so every bracket is
 * something to notice. Unchecked sections are not mentioned either: "Use
 * this" re-checks them, so it is not something the student has to weigh.
 *
 * Pure: takes the catalog and the schedule on screen, returns plain data.
 */
import type { Catalog } from '$lib/model/catalog';
import type { SectionJson, TermName } from '$lib/model/schedb';
import {
  describeMeetingsShort,
  distinctProfessors,
  isPlaceholderProfessor,
  sectionParts,
  type SectionPart,
} from '$lib/model/sectionComponents';
import { formatTermLabel } from '$lib/model/terms';
import { sectionsConflict } from './conflicts';
import { lectureProfessors, nearestBaseline, toGeneratorSection } from './fixCandidates';
import type { Fix, FixTier, NoFixReason } from './fixFinder';
import type { GeneratorSection } from './types';

/** One lecture/lab/discussion that changes: "Lecture  TR 10am - 10:50am AL01 → ...". */
export interface ChangeLine {
  type: string;
  from: string;
  to: string;
  /** A lab/discussion instructor change, stated but never weighted. */
  note: string | null;
}

export interface CourseChange {
  courseId: string;
  label: string;
  /** The course the student clicked; its line only shows parts that move with the pick. */
  isPinnedCourse: boolean;
  tags: string[];
  lines: ChangeLine[];
  /** "makes room for CS1102" when this course moves only because another one did. */
  makesRoomFor: string | null;
  /** Same prof, same term — only times change, so safe to fold away on a long card. */
  minor: boolean;
}

export interface FixCardModel {
  tier: FixTier;
  headline: string[];
  shown: CourseChange[];
  /** Minor changes past {@link MAX_SHOWN_CHANGES}, behind "+N more". */
  folded: CourseChange[];
  sectionIds: string[];
}

export interface PanelHeaderModel {
  /** "Take PH1110" */
  title: string;
  /** "TR 10am - 10:50am AL02" */
  meeting: string;
  tags: string[];
  /** "CS1102 · TR 10am - 10:50am AL01, W 3pm - 4:50pm AX01", one per clashing course on screen. */
  clashes: string[];
}

export interface DescribeContext {
  catalog: Catalog;
  /**
   * Course id → what counts as "no change": its section in the schedule on
   * screen, or every checked section when no schedule exists. A change line's
   * "from" is the nearest of these (`nearestBaseline`).
   */
  baselines: ReadonlyMap<string, readonly string[]>;
  pinnedCourseId: string;
  pinnedComponent: string;
}

/** Changes listed before the rest fold behind "+N more". Non-minor ones always show. */
export const MAX_SHOWN_CHANGES = 3;

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function termsLabel(terms: readonly TermName[]): string {
  return terms.length === 0 ? 'Term TBA' : terms.map(formatTermLabel).join(' – ');
}

function namesLabel(names: readonly string[]): string {
  return names.length === 0 ? 'TBA' : names.join(', ');
}

/** "TR 10am - 10:50am AL01" — times first, then the section name to search or share. */
function partLabel(part: SectionPart): string {
  return `${describeMeetingsShort(part.periods)} ${part.number}`;
}

function realInstructors(part: SectionPart): string[] {
  return distinctProfessors(part.periods).filter((name) => !isPlaceholderProfessor(name));
}

function sameLecturer(section: SectionJson, current: SectionJson): boolean {
  return namesLabel(lectureProfessors(section)) === namesLabel(lectureProfessors(current));
}

function sameTerms(section: SectionJson, current: SectionJson): boolean {
  return termsLabel(section.terms) === termsLabel(current.terms);
}

/** "New prof: Donald Knuth, was Grace Hopper", or null when the lecturer stays. */
function profChange(section: SectionJson, current: SectionJson): string | null {
  if (sameLecturer(section, current)) return null;
  return `New prof: ${namesLabel(lectureProfessors(section))}, was ${namesLabel(lectureProfessors(current))}`;
}

/** "Moves to D-Term", or null when the terms stay. */
function termChange(section: SectionJson, current: SectionJson): string | null {
  return sameTerms(section, current) ? null : `Moves to ${termsLabel(section.terms)}`;
}

function presentOnly(tags: readonly (string | null)[]): string[] {
  return tags.filter((tag): tag is string => tag !== null);
}

/** "New lab instructor: Jane Lee, was Sam Park" — null when nobody real changes. */
function instructorNote(part: SectionPart, oldPart: SectionPart | undefined): string | null {
  const names = realInstructors(part);
  const oldNames = oldPart === undefined ? [] : realInstructors(oldPart);
  if (names.length === 0 || names.join() === oldNames.join()) return null;

  const was = oldNames.length === 0 ? '' : `, was ${oldNames.join(', ')}`;
  return `New ${part.type.toLowerCase()} instructor: ${names.join(', ')}${was}`;
}

/** One line per meeting kind that differs between the two sections. */
function changeLines(section: SectionJson, current: SectionJson, skipPart?: string): ChangeLine[] {
  const parts = sectionParts(section).filter((part) => part.number !== skipPart);
  const oldParts = sectionParts(current);
  const lines: ChangeLine[] = [];

  for (const part of parts) {
    const oldPart = oldParts.find((candidate) => candidate.type === part.type);
    if (oldPart?.number === part.number) continue;
    lines.push({
      type: part.type,
      from: oldPart === undefined ? 'none' : partLabel(oldPart),
      to: partLabel(part),
      note: part.isLead ? null : instructorNote(part, oldPart),
    });
  }

  // A meeting kind the new section drops entirely (rare, but say so).
  const skippedType = sectionParts(section).find((part) => part.number === skipPart)?.type;
  for (const oldPart of oldParts) {
    if (oldPart.type === skippedType || parts.some((part) => part.type === oldPart.type)) continue;
    lines.push({ type: oldPart.type, from: partLabel(oldPart), to: 'none', note: null });
  }
  return lines;
}

function describeCourseChange(
  courseId: string,
  section: SectionJson,
  current: SectionJson,
  context: DescribeContext,
): CourseChange {
  const isPinnedCourse = courseId === context.pinnedCourseId;
  // The picked course's own lecture/term change is the pick itself, stated in the header.
  const tags = isPinnedCourse ? [] : presentOnly([profChange(section, current), termChange(section, current)]);

  return {
    courseId,
    label: context.catalog.courseAbbrev(courseId),
    isPinnedCourse,
    tags,
    lines: changeLines(section, current, isPinnedCourse ? context.pinnedComponent : undefined),
    makesRoomFor: null,
    minor: !isPinnedCourse && tags.length === 0,
  };
}

/**
 * Put changes in the order they happen: your pick's own extras, the courses
 * that clash with it directly, then each course that moves to make room for
 * one already listed.
 */
function orderByCascade(
  changes: CourseChange[],
  newSections: ReadonlyMap<string, GeneratorSection>,
  oldSections: ReadonlyMap<string, GeneratorSection>,
  pinnedCourseId: string,
): CourseChange[] {
  const ordered = changes.filter((change) => change.isPinnedCourse);
  const pinnedNew = newSections.get(pinnedCourseId)!;
  let waiting = changes.filter((change) => !change.isPinnedCourse);

  const direct = waiting.filter((change) => sectionsConflict(oldSections.get(change.courseId)!, pinnedNew));
  ordered.push(...direct);
  waiting = waiting.filter((change) => !direct.includes(change));

  let progressed = true;
  while (waiting.length > 0 && progressed) {
    progressed = false;
    for (const change of [...waiting]) {
      const cause = ordered.find(
        (listed) =>
          !listed.isPinnedCourse &&
          sectionsConflict(oldSections.get(change.courseId)!, newSections.get(listed.courseId)!),
      );
      if (cause === undefined) continue;
      ordered.push({ ...change, makesRoomFor: `makes room for ${cause.label}` });
      waiting = waiting.filter((other) => other !== change);
      progressed = true;
    }
  }
  return [...ordered, ...waiting];
}

/** Every non-minor change, topped up with minor ones to {@link MAX_SHOWN_CHANGES}. */
function foldChanges(changes: CourseChange[]): { shown: CourseChange[]; folded: CourseChange[] } {
  if (changes.length <= MAX_SHOWN_CHANGES) return { shown: changes, folded: [] };

  let minorRoom = Math.max(0, MAX_SHOWN_CHANGES - changes.filter((change) => !change.minor).length);
  const shown: CourseChange[] = [];
  const folded: CourseChange[] = [];
  for (const change of changes) {
    if (!change.minor) shown.push(change);
    else if (minorRoom > 0) {
      shown.push(change);
      minorRoom--;
    } else folded.push(change);
  }
  return { shown, folded };
}

/** What the card changes, worst first; nothing is said about what stays. */
function headlineTags(fix: Fix): string[] {
  const { newProfs, termMoves, coursesMoved } = fix.score;
  return presentOnly([
    newProfs === 0 ? null : plural(newProfs, 'new prof', 'new profs'),
    termMoves === 0 ? null : plural(termMoves, 'term change', 'term changes'),
    coursesMoved === 0 ? null : plural(coursesMoved, 'course moves', 'courses move'),
  ]);
}

/** Build one card of the fix panel. */
export function describeFix(fix: Fix, context: DescribeContext): FixCardModel {
  const newSections = new Map<string, GeneratorSection>();
  const oldSections = new Map<string, GeneratorSection>();
  const changes: CourseChange[] = [];

  for (const sectionId of fix.sectionIds) {
    const courseId = context.catalog.getCourseIdOfSection(sectionId);
    if (courseId === undefined) continue;
    const section = context.catalog.requireSection(sectionId);
    const current = baselineFor(courseId, section, context);
    if (current === null) continue;

    newSections.set(courseId, toGeneratorSection(courseId, section));
    oldSections.set(courseId, toGeneratorSection(courseId, current));

    const change = describeCourseChange(courseId, section, current, context);
    if (change.lines.length > 0) changes.push(change);
  }

  return {
    tier: fix.score.tier,
    headline: headlineTags(fix),
    ...foldChanges(orderByCascade(changes, newSections, oldSections, context.pinnedCourseId)),
    sectionIds: fix.sectionIds,
  };
}

/**
 * Plain-words reason the panel shows when no fix exists.
 *
 * @param searchedLonger Whether the long search has already run, so a time-out
 *   is reported as final rather than with an offer to try again
 */
export function describeNoFix(reason: NoFixReason, catalog: Catalog, searchedLonger = false): string {
  switch (reason.kind) {
    case 'blocked-by-times':
      return 'No fix: this meets during a time you blocked on the Times tab.';
    case 'clashes-with-course':
      return `No fix: every ${catalog.courseAbbrev(reason.courseId)} section clashes with this.`;
    case 'no-combination':
      return "No fix: your other courses can't all fit around this.";
    case 'timed-out':
      return searchedLonger
        ? 'No viable suggestions found, even after searching longer.'
        : 'No viable suggestions found.';
  }
}

/**
 * The cards worth showing first: the best fix of each tier, best tier first.
 * The rest go behind "More options".
 */
export function splitBestPerTier<T extends { tier: FixTier }>(cards: readonly T[]): { best: T[]; more: T[] } {
  const best: T[] = [];
  const more: T[] = [];
  for (const card of cards) {
    if (best.some((kept) => kept.tier === card.tier)) more.push(card);
    else best.push(card);
  }
  return { best, more };
}

/**
 * The other courses that clash with the picked section. With one baseline
 * section (the schedule on screen) the clashing meetings are named; with
 * several (no schedule) a course is listed only when every one clashes.
 */
function describeClashes(picked: GeneratorSection, context: DescribeContext): string[] {
  const clashes: string[] = [];
  for (const [courseId, sectionIds] of context.baselines) {
    if (courseId === context.pinnedCourseId || sectionIds.length === 0) continue;
    const label = context.catalog.courseAbbrev(courseId);
    const sections = sectionIds.map((sectionId) => context.catalog.requireSection(sectionId));

    if (sections.length > 1) {
      const allClash = sections.every((section) => sectionsConflict(picked, toGeneratorSection(courseId, section)));
      if (allClash) clashes.push(`${label} · every checked section`);
      continue;
    }

    const [section] = sections;
    const clashingParts = sectionParts(section).filter((part) =>
      sectionsConflict(picked, { ...toGeneratorSection(courseId, section), periods: part.periods }),
    );
    if (clashingParts.length > 0) clashes.push(`${label} · ${clashingParts.map(partLabel).join(', ')}`);
  }
  return clashes;
}

/** The baseline section `section` is compared with, or null when the course has none. */
function baselineFor(courseId: string, section: SectionJson, context: DescribeContext): SectionJson | null {
  const ids = context.baselines.get(courseId) ?? [];
  if (ids.length === 0) return null;
  const ignoredPart = courseId === context.pinnedCourseId ? context.pinnedComponent : undefined;
  return nearestBaseline(
    section,
    ids.map((sectionId) => context.catalog.requireSection(sectionId)),
    ignoredPart,
  );
}

/**
 * The panel's top: what was picked, how it differs from what is on screen, and
 * what it clashes with.
 *
 * @param pickedSectionId The combined section standing in for the component
 *   (the one closest to the schedule on screen)
 */
export function describePanelHeader(pickedSectionId: string, context: DescribeContext): PanelHeaderModel {
  const picked = context.catalog.requireSection(pickedSectionId);
  const part = sectionParts(picked).find((candidate) => candidate.number === context.pinnedComponent);
  const current = baselineFor(context.pinnedCourseId, picked, context) ?? undefined;

  const tags =
    current === undefined || part === undefined
      ? []
      : presentOnly([
          part.isLead
            ? profChange(picked, current)
            : instructorNote(part, sectionParts(current).find((old) => old.type === part.type)),
          termChange(picked, current),
        ]);

  // "Take MA1024 Lab" when the pick is a lab or discussion, so it is not read as the whole course.
  const what = part === undefined || part.isLead ? '' : ` ${part.type}`;

  return {
    title: `Take ${context.catalog.courseAbbrev(context.pinnedCourseId)}${what}`,
    meeting: part === undefined ? picked.number : partLabel(part),
    tags,
    clashes: describeClashes(toGeneratorSection(context.pinnedCourseId, picked), context),
  };
}
