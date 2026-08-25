/**
 * Seat and waitlist availability, at all three levels the UI asks about.
 *
 * The legacy code spread this across `Period.isPeriodFilled`,
 * `Section.hasAvailableSats` (sic), and four near-identical `Course.has*`
 * methods, two of which used `term.substring(8).charAt(0)` to guess a section's
 * second term. Sections now carry parsed terms, so the term-aware variants are
 * a plain `terms.includes` check.
 */
import type { PeriodJson, SectionJson, TermName } from './schedb.ts';

/** What a term badge or warning icon should show. */
export type Availability = 'open' | 'waitlist' | 'full';

/** Course-level status, plus the case where the course is not taught that term. */
export type TermAvailability = Availability | 'not-offered';

function isPeriodFilled(period: PeriodJson): boolean {
  return period.seatsAvailable <= 0;
}

function isPeriodWaitlistFilled(period: PeriodJson): boolean {
  return period.actualWaitlist === period.maxWaitlist;
}

/**
 * Whether a section can still be registered for.
 *
 * A section is only open if *every* period is — enrolling means taking the
 * lecture and its lab together, so a full lab closes the section.
 */
export function sectionHasAvailableSeats(section: SectionJson): boolean {
  return !section.periods.some(isPeriodFilled);
}

/** Whether every period of a section still has waitlist room. */
export function sectionHasAvailableWaitlist(section: SectionJson): boolean {
  return !section.periods.some(isPeriodWaitlistFilled);
}

export function sectionAvailability(section: SectionJson): Availability {
  if (sectionHasAvailableSeats(section)) return 'open';
  if (sectionHasAvailableWaitlist(section)) return 'waitlist';
  return 'full';
}

/** The best status across a set of sections; 'full' when the set is empty. */
function bestAvailability(sections: readonly SectionJson[]): Availability {
  if (sections.some(sectionHasAvailableSeats)) return 'open';
  if (sections.some(sectionHasAvailableWaitlist)) return 'waitlist';
  return 'full';
}

/** The best status across every section of a course. */
export function courseAvailability(sections: readonly SectionJson[]): Availability {
  return bestAvailability(sections);
}

/** The best status across the sections of a course taught in one term. */
export function courseAvailabilityForTerm(
  sections: readonly SectionJson[],
  term: TermName,
): TermAvailability {
  const inTerm = sections.filter((section) => section.terms.includes(term));
  if (inTerm.length === 0) return 'not-offered';
  return bestAvailability(inTerm);
}
