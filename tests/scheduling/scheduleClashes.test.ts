import { describe, expect, it } from 'vitest';
import { clashingCourseIds } from '$lib/scheduling/scheduleClashes';

/** `pairs` lists the clashing [candidate, option] section pairs. */
function clashTest(pairs: [string, string][]) {
  return (sectionId: string, otherId: string) =>
    pairs.some(([candidate, option]) => candidate === sectionId && option === otherId);
}

describe('clashingCourseIds', () => {
  it("is empty when one of the row's sections fits the schedule on screen", () => {
    const hasConflict = clashTest([['PH|1110|AL01/AX01', 'CS|1102|AL01']]);
    const onScreen = new Map([['CS|1102', ['CS|1102|AL01']]]);
    expect(clashingCourseIds(['PH|1110|AL01/AX01', 'PH|1110|AL01/AX02'], onScreen, hasConflict)).toEqual([]);
  });

  it('names the courses blocking the least-blocked section', () => {
    const hasConflict = clashTest([
      ['PH|1110|AL01/AX01', 'CS|1102|AL01'],
      ['PH|1110|AL01/AX01', 'MA|1021|A01'],
      ['PH|1110|AL01/AX02', 'MA|1021|A01'],
    ]);
    const onScreen = new Map([
      ['CS|1102', ['CS|1102|AL01']],
      ['MA|1021', ['MA|1021|A01']],
    ]);
    expect(clashingCourseIds(['PH|1110|AL01/AX01', 'PH|1110|AL01/AX02'], onScreen, hasConflict)).toEqual([
      'MA|1021',
    ]);
  });

  it('with no schedule, blocks only when every checked section of a course clashes', () => {
    const checked = new Map([['CS|1102', ['CS|1102|AL01', 'CS|1102|AL02']]]);
    const oneClashes = clashTest([['PH|1110|AL01', 'CS|1102|AL01']]);
    expect(clashingCourseIds(['PH|1110|AL01'], checked, oneClashes)).toEqual([]);

    const bothClash = clashTest([
      ['PH|1110|AL01', 'CS|1102|AL01'],
      ['PH|1110|AL01', 'CS|1102|AL02'],
    ]);
    expect(clashingCourseIds(['PH|1110|AL01'], checked, bothClash)).toEqual(['CS|1102']);
  });

  it('ignores a course with nothing checked, as the search does', () => {
    expect(clashingCourseIds(['PH|1110|AL01'], new Map([['CS|1102', []]]), () => true)).toEqual([]);
  });

  it('is empty for a row with no sections', () => {
    expect(clashingCourseIds([], new Map([['CS|1102', ['CS|1102|AL01']]]), () => true)).toEqual([]);
  });
});
