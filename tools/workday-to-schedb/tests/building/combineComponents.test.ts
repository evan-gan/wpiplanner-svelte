import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAY_BITS, type PeriodJson } from '../../../../src/lib/model/schedb.ts';
import { combineComponents, type ComponentSection } from '../../src/combine.ts';

function period(days: number, startHour: number, endHour: number): PeriodJson {
  return {
    type: 'Lecture',
    professor: 'Ada Lovelace',
    days,
    startMinutes: startHour * 60,
    endMinutes: endHour * 60,
    location: 'Olin Hall 126',
    seats: 25,
    seatsAvailable: 5,
    actualWaitlist: 0,
    maxWaitlist: 10,
    sectionNumber: 'A01',
  };
}

function component(overrides: Partial<ComponentSection> = {}): ComponentSection {
  return {
    number: 'AL01',
    meetingType: 'Lecture',
    clusterId: '',
    isSpecial: false,
    isInterestList: false,
    termLabel: 'A Term',
    terms: ['A'],
    seats: 25,
    seatsAvailable: 5,
    actualWaitlist: 0,
    maxWaitlist: 10,
    descriptionIndex: 3,
    periods: [period(DAY_BITS.mon, 9, 10)],
    ...overrides,
  };
}

const labels = (sections: readonly { number: string }[]): string[] =>
  sections.map((section) => section.number);

describe('combineComponents', () => {
  it('publishes lectures unchanged when a course has nothing to pair them with', () => {
    const sections = combineComponents([
      component({ number: 'A01' }),
      component({ number: 'A02' }),
    ]);

    assert.deepEqual(labels(sections), ['A01', 'A02']);
  });

  it('pairs each lecture with each lab it does not overlap', () => {
    const sections = combineComponents([
      component({ number: 'AL01' }),
      component({ number: 'AX01', meetingType: 'Lab', periods: [period(DAY_BITS.tue, 10, 12)] }),
      component({ number: 'AX02', meetingType: 'Lab', periods: [period(DAY_BITS.wed, 10, 12)] }),
    ]);

    assert.deepEqual(labels(sections), ['AL01/AX01', 'AL01/AX02']);
  });

  it('drops a pairing whose components meet at the same time', () => {
    const sections = combineComponents([
      component({ number: 'AL01', periods: [period(DAY_BITS.mon, 9, 10)] }),
      component({ number: 'AX01', meetingType: 'Lab', periods: [period(DAY_BITS.mon, 9, 10)] }),
      component({ number: 'AX02', meetingType: 'Lab', periods: [period(DAY_BITS.mon, 10, 11)] }),
    ]);

    assert.deepEqual(labels(sections), ['AL01/AX02']);
  });

  it('lets components meet at the same hour on different days', () => {
    const sections = combineComponents([
      component({ number: 'AL01', periods: [period(DAY_BITS.mon, 9, 10)] }),
      component({ number: 'AX01', meetingType: 'Lab', periods: [period(DAY_BITS.tue, 9, 10)] }),
    ]);

    assert.deepEqual(labels(sections), ['AL01/AX01']);
  });

  it('crosses lecture, discussion, and lab together', () => {
    const sections = combineComponents([
      component({ number: 'AL01', periods: [period(DAY_BITS.mon, 8, 9)] }),
      component({
        number: 'AD01',
        meetingType: 'Discussion',
        periods: [period(DAY_BITS.mon, 9, 10)],
      }),
      component({ number: 'AX01', meetingType: 'Lab', periods: [period(DAY_BITS.mon, 10, 11)] }),
      component({ number: 'AX02', meetingType: 'Lab', periods: [period(DAY_BITS.mon, 11, 12)] }),
    ]);

    assert.deepEqual(labels(sections), ['AL01/AD01/AX01', 'AL01/AD01/AX02']);
  });

  it('keeps components of different clusters apart', () => {
    const sections = combineComponents([
      component({ number: 'AL01', clusterId: 'CLUSTER-1' }),
      component({
        number: 'AX01',
        meetingType: 'Lab',
        clusterId: 'CLUSTER-1',
        periods: [period(DAY_BITS.tue, 10, 12)],
      }),
      component({
        number: 'AX02',
        meetingType: 'Lab',
        clusterId: 'CLUSTER-2',
        periods: [period(DAY_BITS.wed, 10, 12)],
      }),
    ]);

    assert.deepEqual(labels(sections), ['AL01/AX01']);
  });

  it('lets a component with no cluster join one that has a cluster', () => {
    const sections = combineComponents([
      component({ number: 'AL01', clusterId: 'CLUSTER-1' }),
      component({
        number: 'AX01',
        meetingType: 'Lab',
        clusterId: '',
        periods: [period(DAY_BITS.tue, 10, 12)],
      }),
    ]);

    assert.deepEqual(labels(sections), ['AL01/AX01']);
  });

  it('refuses to pair a special-topics lecture that declares no cluster', () => {
    const sections = combineComponents([
      component({ number: 'A01 - ST: Robot Ethics', isSpecial: true }),
      component({
        number: 'AX01',
        meetingType: 'Lab',
        isSpecial: true,
        periods: [period(DAY_BITS.tue, 10, 12)],
      }),
    ]);

    assert.deepEqual(labels(sections), ['A01 - ST: Robot Ethics']);
  });

  it('drops the title from every special-topics label but the last', () => {
    const sections = combineComponents([
      component({ number: 'A01 - ST: Robot Ethics', isSpecial: true, clusterId: 'CLUSTER-1' }),
      component({
        number: 'AX01 - ST: Robot Ethics',
        meetingType: 'Lab',
        isSpecial: true,
        clusterId: 'CLUSTER-1',
        periods: [period(DAY_BITS.tue, 10, 12)],
      }),
    ]);

    assert.deepEqual(labels(sections), ['A01/AX01 - ST: Robot Ethics']);
  });

  it('publishes an interest list on its own', () => {
    const sections = combineComponents([
      component({ number: 'Interest List-A Term', isInterestList: true }),
      component({ number: 'AX01', meetingType: 'Lab', periods: [period(DAY_BITS.tue, 10, 12)] }),
    ]);

    assert.deepEqual(labels(sections), ['Interest List-A Term']);
  });

  it('takes the tightest seat count of the components it merged', () => {
    const [section] = combineComponents([
      component({ number: 'AL01', seats: 30, seatsAvailable: 12, maxWaitlist: 10 }),
      component({
        number: 'AX01',
        meetingType: 'Lab',
        seats: 20,
        seatsAvailable: 2,
        maxWaitlist: 4,
        periods: [period(DAY_BITS.tue, 10, 12)],
      }),
    ]);

    assert.equal(section.seats, 20);
    assert.equal(section.seatsAvailable, 2);
    assert.equal(section.maxWaitlist, 4);
  });

  it('carries both components\' meetings onto the combined section', () => {
    const [section] = combineComponents([
      component({ number: 'AL01' }),
      component({ number: 'AX01', meetingType: 'Lab', periods: [period(DAY_BITS.tue, 10, 12)] }),
    ]);

    assert.equal(section.periods.length, 2);
  });

  it('publishes a lab-only or seminar-only course rather than dropping it', () => {
    const labOnly = combineComponents([component({ number: 'AX01', meetingType: 'Lab' })]);
    const seminarOnly = combineComponents([component({ number: 'A01', meetingType: 'Seminar' })]);

    assert.deepEqual(labels(labOnly), ['AX01']);
    assert.deepEqual(labels(seminarOnly), ['A01']);
  });
});
