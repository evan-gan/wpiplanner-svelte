import { describe, expect, it } from 'vitest';
import type { CourseJson, PeriodJson, SectionJson } from '$lib/model/schedb';
import { parseDayMask } from '$lib/model/days';
import {
  buildCourseComponents,
  buildLectureEntries,
  closestSection,
  groupEntriesByTerm,
  describeMeetings,
  isComponentOn,
  isPlaceholderProfessor,
  sectionsForLinkedToggle,
} from '$lib/model/sectionComponents';
import { makeCourse, makePeriod, makeSection } from '../fixtures/miniCatalog';

/** A period carrying its own component label, which `makeSection` would overwrite. */
function part(sectionNumber: string, type: string, professor = 'Ada Lovelace'): PeriodJson {
  return makePeriod({ sectionNumber, type, professor });
}

/** A combined section such as `PH|1110|AL01/AX01`, keeping each period's own label. */
function combo(id: string, periods: PeriodJson[]): SectionJson {
  return { ...makeSection(id, ['A'], []), periods };
}

/** Two lectures, each with two labs of its own, plus one shared discussion. */
function physics(): CourseJson {
  return makeCourse('PH', '1110', 'Mechanics', [
    combo('PH|1110|AL01/AD01/AX01', [part('AL01', 'Lecture'), part('AD01', 'Discussion'), part('AX01', 'Lab', 'Grace Hopper')]),
    combo('PH|1110|AL01/AD01/AX02', [part('AL01', 'Lecture'), part('AD01', 'Discussion'), part('AX02', 'Lab', 'Grace Hopper')]),
    combo('PH|1110|AL02/AD01/AX03', [part('AL02', 'Lecture', 'Alan Turing'), part('AD01', 'Discussion'), part('AX03', 'Lab')]),
    combo('PH|1110|AL02/AD01/AX04', [part('AL02', 'Lecture', 'Alan Turing'), part('AD01', 'Discussion'), part('AX04', 'Lab')]),
  ]);
}

const nothingDenied = () => false;
const deniedSet = (ids: string[]) => (id: string) => ids.includes(id);

describe('buildCourseComponents', () => {
  it('lists each lecture once, however many combinations it appears in', () => {
    const { primary } = buildCourseComponents(physics());
    expect(primary.map((lecture) => lecture.number)).toEqual(['AL01', 'AL02']);
    expect(primary[0].sectionIds).toEqual(['PH|1110|AL01/AD01/AX01', 'PH|1110|AL01/AD01/AX02']);
  });

  it('groups the other meetings by type, in first-seen order', () => {
    const { secondary } = buildCourseComponents(physics());
    expect(secondary.map((group) => group.type)).toEqual(['Discussion', 'Lab']);
    expect(secondary[1].components.map((lab) => lab.number)).toEqual(['AX01', 'AX02', 'AX03', 'AX04']);
  });

  it('maps a component shared by several lectures to all their sections', () => {
    const discussion = buildCourseComponents(physics()).secondary[0].components[0];
    expect(discussion.sectionIds).toHaveLength(4);
  });

  it('gives a lecture-only course no second step', () => {
    const course = makeCourse('MA', '1021', 'Calculus I', [
      makeSection('MA|1021|A01', ['A'], [makePeriod()]),
      makeSection('MA|1021|A02', ['A'], [makePeriod()]),
    ]);
    const components = buildCourseComponents(course);
    expect(components.primary.map((lecture) => lecture.number)).toEqual(['A01', 'A02']);
    expect(components.secondary).toEqual([]);
  });

  it('leads with the first meeting when a section has no lecture', () => {
    const course = makeCourse('CH', '1010', 'Lab only', [
      combo('CH|1010|AX01/AD01', [part('AX01', 'Lab'), part('AD01', 'Discussion')]),
    ]);
    const components = buildCourseComponents(course);
    expect(components.primary[0].number).toBe('AX01');
    expect(components.secondary[0].type).toBe('Discussion');
  });

  it('collects distinct professors per component', () => {
    const lab = buildCourseComponents(physics()).secondary[1].components[0];
    expect(lab.professors).toEqual(['Grace Hopper']);
  });
});

/** One lecture, two labs, two discussions: every lab pairs with every discussion. */
function labAndDiscussion(): CourseJson {
  return makeCourse('CH', '1010', 'Chemistry', [
    combo('CH|1010|AL01/AD01/AX01', [part('AL01', 'Lecture'), part('AD01', 'Discussion'), part('AX01', 'Lab')]),
    combo('CH|1010|AL01/AD01/AX02', [part('AL01', 'Lecture'), part('AD01', 'Discussion'), part('AX02', 'Lab')]),
    combo('CH|1010|AL01/AD02/AX01', [part('AL01', 'Lecture'), part('AD02', 'Discussion'), part('AX01', 'Lab')]),
    combo('CH|1010|AL01/AD02/AX02', [part('AL01', 'Lecture'), part('AD02', 'Discussion'), part('AX02', 'Lab')]),
  ]);
}

describe('buildLectureEntries', () => {
  it('nests under each lecture only the labs that go with it', () => {
    const entries = buildLectureEntries(buildCourseComponents(physics()));
    const labsOf = (index: number) =>
      entries[index].linked.find((group) => group.type === 'Lab')?.components.map((lab) => lab.number);

    expect(labsOf(0)).toEqual(['AX01', 'AX02']);
    expect(labsOf(1)).toEqual(['AX03', 'AX04']);
  });

  it('repeats a shared discussion under each lecture, cut to that lecture\'s sections', () => {
    const entries = buildLectureEntries(buildCourseComponents(physics()));
    const discussionUnder = (index: number) => entries[index].linked[0].components[0];

    expect(discussionUnder(0).sectionIds).toEqual(['PH|1110|AL01/AD01/AX01', 'PH|1110|AL01/AD01/AX02']);
    expect(discussionUnder(1).sectionIds).toEqual(['PH|1110|AL02/AD01/AX03', 'PH|1110|AL02/AD01/AX04']);
  });

  it('lists a professor once per lecture they teach', () => {
    const course = makeCourse('MA', '1021', 'Calculus I', [
      combo('MA|1021|AL01/AD01', [part('AL01', 'Lecture', 'Ada Lovelace'), part('AD01', 'Discussion')]),
      combo('MA|1021|AL02/AD02', [part('AL02', 'Lecture', 'Ada Lovelace'), part('AD02', 'Discussion')]),
    ]);
    const entries = buildLectureEntries(buildCourseComponents(course));
    expect(entries.map((entry) => entry.lecture.professors[0])).toEqual(['Ada Lovelace', 'Ada Lovelace']);
    expect(entries.map((entry) => entry.linked[0].components[0].number)).toEqual(['AD01', 'AD02']);
  });

  it('gives a lecture-only course nothing to nest', () => {
    const course = makeCourse('MA', '1022', 'Calculus II', [makeSection('MA|1022|A01', ['A'], [makePeriod()])]);
    expect(buildLectureEntries(buildCourseComponents(course))[0].linked).toEqual([]);
  });
});

describe('sectionsForLinkedToggle', () => {
  function setup() {
    const components = buildCourseComponents(labAndDiscussion());
    const [entry] = buildLectureEntries(components);
    const find = (number: string) =>
      entry.linked.flatMap((group) => group.components).find((component) => component.number === number)!;
    return { components, entry, find };
  }

  it('turning a lab off denies its pairings with this lecture only', () => {
    const shared = buildCourseComponents(physics());
    const entries = buildLectureEntries(shared);
    const discussion = entries[0].linked[0].components[0];
    expect(sectionsForLinkedToggle(shared, entries[0], discussion, false, nothingDenied)).toEqual([
      'PH|1110|AL01/AD01/AX01',
      'PH|1110|AL01/AD01/AX02',
    ]);
  });

  it('turning a lab on skips a discussion the student switched off', () => {
    const { components, entry, find } = setup();
    // AD02 off everywhere, AX02 off everywhere.
    const isDenied = deniedSet([
      'CH|1010|AL01/AD02/AX01',
      'CH|1010|AL01/AD02/AX02',
      'CH|1010|AL01/AD01/AX02',
    ]);
    expect(sectionsForLinkedToggle(components, entry, find('AX02'), true, isDenied)).toEqual([
      'CH|1010|AL01/AD01/AX02',
    ]);
  });

  it('turning a lab on restores every pairing when no sibling is on', () => {
    const { components, entry, find } = setup();
    const isDenied = deniedSet(labAndDiscussion().sections.map((section) => section.id));
    expect(sectionsForLinkedToggle(components, entry, find('AX01'), true, isDenied)).toEqual([
      'CH|1010|AL01/AD01/AX01',
      'CH|1010|AL01/AD02/AX01',
    ]);
  });
});

describe('isPlaceholderProfessor', () => {
  it('recognises Workday placeholders in any case, but not real names', () => {
    expect(isPlaceholderProfessor('N/A')).toBe(true);
    expect(isPlaceholderProfessor(' not assigned ')).toBe(true);
    expect(isPlaceholderProfessor('Ada Lovelace')).toBe(false);
  });
});

describe('isComponentOn', () => {
  it('is on while any of its sections is on', () => {
    const lecture = buildCourseComponents(physics()).primary[0];
    expect(isComponentOn(lecture, deniedSet([lecture.sectionIds[0]]))).toBe(true);
    expect(isComponentOn(lecture, deniedSet(lecture.sectionIds))).toBe(false);
  });
});

describe('describeMeetings', () => {
  it('prints WPI day letters, with R for Thursday', () => {
    const period = makePeriod({ days: parseDayMask('mon,tue,thu,fri'), startMinutes: 600, endMinutes: 650 });
    expect(describeMeetings([period])).toEqual(['MTRF 10:00-10:50AM']);
  });

  it('keeps both halves of the day when the meeting crosses noon', () => {
    const period = makePeriod({ days: parseDayMask('wed'), startMinutes: 11 * 60, endMinutes: 13 * 60 });
    expect(describeMeetings([period])).toEqual(['W 11:00AM-1:00PM']);
  });

  it('says TBA for unknown days and drops repeated patterns', () => {
    const period = makePeriod({ days: 0 });
    expect(describeMeetings([period, period])).toEqual(['Days TBA 9:00-9:50AM']);
  });
});

describe('closestSection', () => {
  const components = buildCourseComponents(labAndDiscussion());
  const discussion = (number: string) =>
    components.secondary.find((group) => group.type === 'Discussion')!.components.find((c) => c.number === number)!;

  it('keeps the scheduled lab when a different discussion is hovered', () => {
    // Scheduled: AD01 + AX02. Hovering AD02 must preview AD02 + AX02, not AD02 + AX01.
    expect(
      closestSection(components, discussion('AD02').sectionIds, 'CH|1010|AL01/AD01/AX02', nothingDenied),
    ).toBe('CH|1010|AL01/AD02/AX02');
  });

  it('prefers a section that is switched on when nothing is scheduled', () => {
    const isDenied = deniedSet(['CH|1010|AL01/AD02/AX01']);
    expect(closestSection(components, discussion('AD02').sectionIds, undefined, isDenied)).toBe(
      'CH|1010|AL01/AD02/AX02',
    );
  });

  it('still keeps the scheduled lab even if that pairing is switched off', () => {
    const isDenied = deniedSet(['CH|1010|AL01/AD02/AX02']);
    expect(
      closestSection(components, discussion('AD02').sectionIds, 'CH|1010|AL01/AD01/AX02', isDenied),
    ).toBe('CH|1010|AL01/AD02/AX02');
  });
});

describe('groupEntriesByTerm', () => {
  function lectureIn(id: string, terms: ('A' | 'B' | 'C' | 'D')[]): SectionJson {
    const number = id.split('|')[2];
    return { ...makeSection(id, terms, []), periods: [part(number, 'Lecture')] };
  }

  function groupsOf(sections: SectionJson[]) {
    const course = makeCourse('MA', '1021', 'Calculus I', sections);
    return groupEntriesByTerm(buildLectureEntries(buildCourseComponents(course)), course);
  }

  it('puts the terms in calendar order whatever the catalog order', () => {
    const groups = groupsOf([
      lectureIn('MA|1021|CL01', ['C']),
      lectureIn('MA|1021|AL01', ['A']),
      lectureIn('MA|1021|AL02', ['A']),
    ]);
    expect(groups.map((group) => group.label)).toEqual(['A-Term', 'C-Term']);
    expect(groups[0].entries.map((entry) => entry.lecture.number)).toEqual(['AL01', 'AL02']);
  });

  it('places a two-term lecture after its first term and before the next', () => {
    const groups = groupsOf([
      lectureIn('MA|1021|BL01', ['B']),
      lectureIn('MA|1021|AB01', ['A', 'B']),
      lectureIn('MA|1021|AL01', ['A']),
    ]);
    expect(groups.map((group) => group.label)).toEqual(['A-Term', 'A-Term – B-Term', 'B-Term']);
  });

  it('labels lectures with no term and lists them last', () => {
    const groups = groupsOf([lectureIn('MA|1021|X01', []), lectureIn('MA|1021|AL01', ['A'])]);
    expect(groups.map((group) => group.label)).toEqual(['A-Term', 'Term TBA']);
  });
});
