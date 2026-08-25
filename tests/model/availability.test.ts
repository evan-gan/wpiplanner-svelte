import { describe, expect, it } from 'vitest';
import type { PeriodJson, SectionJson } from '$lib/model/schedb';
import {
  courseAvailability,
  courseAvailabilityForTerm,
  sectionAvailability,
  sectionHasAvailableSeats,
  sectionHasAvailableWaitlist,
} from '$lib/model/availability';

function period(overrides: Partial<PeriodJson> = {}): PeriodJson {
  return {
    type: 'Lecture',
    professor: 'A Professor',
    days: 0b0101010,
    startMinutes: 9 * 60,
    endMinutes: 9 * 60 + 50,
    location: 'SL 104',
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 5,
    sectionNumber: 'A01',
    ...overrides,
  };
}

function section(overrides: Partial<SectionJson> = {}): SectionJson {
  return {
    id: 'CS|2102|A01',
    crn: '1',
    number: 'A01',
    termLabel: 'A Term',
    terms: ['A'],
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 5,
    descriptionIndex: -1,
    periods: [period()],
    ...overrides,
  };
}

describe('sectionHasAvailableSeats', () => {
  it('is true when every period still has seats', () => {
    expect(sectionHasAvailableSeats(section())).toBe(true);
  });

  it('is false when any one period is full, even if the others are not', () => {
    const mixed = section({ periods: [period(), period({ seatsAvailable: 0 })] });
    expect(sectionHasAvailableSeats(mixed)).toBe(false);
  });

  it('treats a negative seat count as full', () => {
    expect(sectionHasAvailableSeats(section({ periods: [period({ seatsAvailable: -3 })] }))).toBe(
      false,
    );
  });

  it('is true for a section with no periods, matching the legacy loop', () => {
    expect(sectionHasAvailableSeats(section({ periods: [] }))).toBe(true);
  });
});

describe('sectionHasAvailableWaitlist', () => {
  it('is true while the waitlist has room', () => {
    expect(sectionHasAvailableWaitlist(section())).toBe(true);
  });

  it('is false once any period waitlist is exactly full', () => {
    const full = section({ periods: [period({ actualWaitlist: 5, maxWaitlist: 5 })] });
    expect(sectionHasAvailableWaitlist(full)).toBe(false);
  });
});

describe('sectionAvailability', () => {
  it('reports open when seats remain', () => {
    expect(sectionAvailability(section())).toBe('open');
  });

  it('reports waitlist when seats are gone but the waitlist is not', () => {
    const waitlisted = section({ periods: [period({ seatsAvailable: 0, actualWaitlist: 2 })] });
    expect(sectionAvailability(waitlisted)).toBe('waitlist');
  });

  it('reports full when neither seats nor waitlist remain', () => {
    const full = section({
      periods: [period({ seatsAvailable: 0, actualWaitlist: 5, maxWaitlist: 5 })],
    });
    expect(sectionAvailability(full)).toBe('full');
  });
});

describe('courseAvailability', () => {
  it('is open when any section is open', () => {
    const sections = [
      section({ id: 'a', periods: [period({ seatsAvailable: 0, actualWaitlist: 5 })] }),
      section({ id: 'b' }),
    ];
    expect(courseAvailability(sections)).toBe('open');
  });

  it('is full when every section is full', () => {
    const closed = [
      section({ id: 'a', periods: [period({ seatsAvailable: 0, actualWaitlist: 5 })] }),
      section({ id: 'b', periods: [period({ seatsAvailable: 0, actualWaitlist: 5 })] }),
    ];
    expect(courseAvailability(closed)).toBe('full');
  });

  it('is full for a course with no sections at all', () => {
    expect(courseAvailability([])).toBe('full');
  });
});

describe('courseAvailabilityForTerm', () => {
  const sections = [
    section({ id: 'a', terms: ['A'] }),
    section({
      id: 'b',
      terms: ['B'],
      periods: [period({ seatsAvailable: 0, actualWaitlist: 5, maxWaitlist: 5 })],
    }),
    // A two-term section: the legacy `term.substring(8)` hack only ever saw its
    // second term, so C looked unavailable here. The parsed terms fix that.
    section({ id: 'c', terms: ['C', 'D'] }),
  ];

  it('sees an open single-term section', () => {
    expect(courseAvailabilityForTerm(sections, 'A')).toBe('open');
  });

  it('sees a full single-term section', () => {
    expect(courseAvailabilityForTerm(sections, 'B')).toBe('full');
  });

  it('sees both halves of a two-term section', () => {
    expect(courseAvailabilityForTerm(sections, 'C')).toBe('open');
    expect(courseAvailabilityForTerm(sections, 'D')).toBe('open');
  });

  it('returns not-offered for a term the course never runs in', () => {
    expect(courseAvailabilityForTerm([section({ terms: ['A'] })], 'D')).toBe('not-offered');
  });
});
