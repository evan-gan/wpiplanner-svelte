import { describe, expect, it } from 'vitest';
import { buildFixRequest, changeCost, lectureProfessors, nearestBaseline } from '$lib/scheduling/fixCandidates';
import { allTimesAvailable } from '../../fixtures/generatorFixtures';
import { fixCatalog } from '../../fixtures/fixCatalog';

const catalog = fixCatalog();
const sectionOf = (id: string) => catalog.requireSection(id);
const current = sectionOf('CS|1102|AL01/AX01');

describe('changeCost', () => {
  it('costs nothing for the section already on screen', () => {
    expect(changeCost(current, current, false)).toEqual({
      moved: false,
      newProf: false,
      termMove: false,
      timeShift: 0,
      unchecked: false,
    });
  });

  it('treats a different section with the same lecturer as a move, not a new prof', () => {
    const cost = changeCost(sectionOf('CS|1102|AL03/AX03'), current, false);
    expect(cost).toMatchObject({ moved: true, newProf: false, termMove: false });
    expect(cost.timeShift).toBeGreaterThan(0);
  });

  it('flags a new lecture prof but ignores a new lab instructor', () => {
    expect(changeCost(sectionOf('CS|1102|AL04/AX04'), current, false).newProf).toBe(true);
    expect(changeCost(sectionOf('CS|1102|AL01/AX02'), current, false).newProf).toBe(false);
  });

  it('flags a term move and an unchecked section', () => {
    expect(changeCost(sectionOf('CS|1102|BL01/BX01'), current, true)).toMatchObject({
      termMove: true,
      unchecked: true,
    });
  });

  it('charges the pinned course only for the parts that come with the pick', () => {
    const sameLab = changeCost(sectionOf('CS|1102|AL01/AX01'), sectionOf('CS|1102|AL04/AX04'), false, 'AL01');
    expect(sameLab).toMatchObject({ moved: false, newProf: false, termMove: false });
    expect(sameLab.timeShift).toBe(0);

    const otherLab = changeCost(sectionOf('CS|1102|AL01/AX02'), sectionOf('CS|1102|AL04/AX04'), false, 'AL01');
    expect(otherLab.timeShift).toBeGreaterThan(0);
  });
});

describe('nearestBaseline', () => {
  const checked = [sectionOf('CS|1102|AL01/AX01'), sectionOf('CS|1102|AL04/AX04')];

  it('is the candidate itself when it is a baseline section', () => {
    expect(nearestBaseline(checked[1], checked).id).toBe('CS|1102|AL04/AX04');
  });

  it('prefers a baseline section with the same lecturer over a closer time', () => {
    // AL03 (Hopper, MWF 1pm) is nearer in time to AL04 (Knuth, MWF 9am) but shares AL01's lecturer.
    expect(nearestBaseline(sectionOf('CS|1102|AL03/AX03'), checked).id).toBe('CS|1102|AL01/AX01');
  });
});

describe('lectureProfessors', () => {
  it('reads the lecture part only', () => {
    expect(lectureProfessors(current)).toEqual(['Grace Hopper']);
  });
});

describe('buildFixRequest', () => {
  it('limits the pinned course to sections with the component, and offers every section of the others', () => {
    const request = buildFixRequest({
      pinned: {
        course: catalog.requireCourse('CS|2102'),
        baselineSectionIds: ['CS|2102|AL01'],
        isDenied: () => false,
        componentNumber: 'AL02',
        componentSectionIds: ['CS|2102|AL02'],
      },
      others: [
        { course: catalog.requireCourse('CS|1102'), baselineSectionIds: ['CS|1102|AL01/AX01'], isDenied: () => true },
      ],
      chosenTimes: allTimesAvailable(),
    });

    expect(request.pinnedCourse.candidates.map((option) => option.section.id)).toEqual(['CS|2102|AL02']);
    expect(request.otherCourses[0].candidates).toHaveLength(5);
    expect(request.otherCourses[0].candidates.every((option) => option.cost.unchecked)).toBe(true);
  });

  it('explains a schedule that does not belong to the catalog', () => {
    expect(() =>
      buildFixRequest({
        pinned: {
          course: catalog.requireCourse('CS|2102'),
          baselineSectionIds: ['CS|2102|ZZ99'],
          isDenied: () => false,
          componentNumber: 'AL02',
          componentSectionIds: ['CS|2102|AL02'],
        },
        others: [],
        chosenTimes: allTimesAvailable(),
      }),
    ).toThrow(/ZZ99 is not in course CS\|2102/);
  });
});
