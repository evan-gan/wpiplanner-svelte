import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  detectAcademicYear,
  formatAcademicYearHeader,
  isPlannableEntry,
  offeringPeriodsFor,
  type ReportEntry,
} from '../../src/feed.ts';

function entry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    Course_Section: 'CS 2102-A01 - Object-Oriented Design Concepts',
    Course_Title: 'CS 2102 - Object-Oriented Design Concepts',
    Offering_Period: '2026 Fall A Term',
    Starting_Academic_Period_Type: 'A Term',
    Instructional_Format: 'Lecture',
    Section_Status: 'Open',
    Section_Details: 'Fuller Labs 320 | M | 9:00 AM - 9:50 AM',
    Enrolled_Capacity: '18/25',
    Waitlist_Waitlist_Capacity: '0/10',
    Instructors: 'Ada Lovelace',
    Course_Description: '',
    Credits: '3',
    CF_LRV_Cluster_Ref_ID: '',
    ...overrides,
  };
}

describe('detectAcademicYear', () => {
  it('picks the fall year most of the feed agrees on', () => {
    const entries = [
      ...Array.from({ length: 10 }, () => entry({ Offering_Period: '2026 Fall A Term' })),
      // Next year's early listings must not move the catalog forward.
      entry({ Offering_Period: '2027 Fall B Term' }),
    ];

    assert.deepEqual(detectAcademicYear(entries), { fallYear: 2026, springYear: 2027 });
  });

  it('explains itself when no row names a fall term', () => {
    assert.throws(
      () => detectAcademicYear([entry({ Offering_Period: 'Summer Session' })]),
      /the academic year could not be determined/,
    );
  });
});

describe('formatAcademicYearHeader', () => {
  it('reads the way the app header shows it', () => {
    assert.equal(
      formatAcademicYearHeader({ fallYear: 2026, springYear: 2027 }),
      '2026 - 2027 Academic Year',
    );
  });
});

describe('isPlannableEntry', () => {
  const periods = offeringPeriodsFor({ fallYear: 2026, springYear: 2027 });

  it('keeps the six terms the planner lays out', () => {
    for (const offeringPeriod of periods) {
      assert.equal(isPlannableEntry(entry({ Offering_Period: offeringPeriod }), periods), true);
    }
  });

  it('drops a term the planner does not lay out', () => {
    assert.equal(
      isPlannableEntry(entry({ Offering_Period: '2027 Spring Late Start Online' }), periods),
      false,
    );
  });

  it('drops next year\'s early listings', () => {
    assert.equal(isPlannableEntry(entry({ Offering_Period: '2027 Fall B Term' }), periods), false);
  });

  it('drops a withdrawn section', () => {
    assert.equal(
      isPlannableEntry(entry({ Section_Status: 'Canceled: Preliminary' }), periods),
      false,
    );
  });

  it('keeps an interest list lecture but not its lab', () => {
    const interestList = { Course_Section: 'CH 1010-AL-Interest List - Chemical Properties' };

    assert.equal(isPlannableEntry(entry(interestList), periods), true);
    assert.equal(
      isPlannableEntry(entry({ ...interestList, Instructional_Format: 'Laboratory' }), periods),
      false,
    );
  });
});
