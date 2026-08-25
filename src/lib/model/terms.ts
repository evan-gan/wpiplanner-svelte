/**
 * Term helpers.
 *
 * Sections carry a parsed `terms: TermName[]` in the wire format, which replaces
 * the legacy `Section.term.substring(8).charAt(0)` string surgery — that only
 * worked for a section spanning exactly two terms in one fixed label format.
 */
import type { TermName } from './schedb.ts';

/** Academic terms in calendar order. */
export const TERM_NAMES: readonly TermName[] = ['A', 'B', 'C', 'D'];

/**
 * Parse the `part-of-term` attribute into the list of terms a section spans.
 *
 * Observed values are single terms ("A Term") and paired half-year courses
 * ("A Term, B Term").
 *
 * @param rawTermLabel Text such as "A Term" or "C Term, D Term"
 * @returns Terms in calendar order, deduplicated
 * @throws Error when a token does not name a known term
 */
export function parseTerms(rawTermLabel: string): TermName[] {
  const found = new Set<TermName>();

  for (const token of rawTermLabel.split(',')) {
    const label = token.trim();
    if (label === '') continue;

    const term = TERM_NAMES.find((name) => label === name || label === `${name} Term`);
    if (term === undefined) {
      throw new Error(
        `Unknown term ${JSON.stringify(label)} in ${JSON.stringify(rawTermLabel)}; ` +
          `expected one of ${TERM_NAMES.map((name) => `"${name} Term"`).join(', ')}.`,
      );
    }
    found.add(term);
  }

  return TERM_NAMES.filter((name) => found.has(name));
}

/**
 * Whether two sections are ever taught at the same time of year.
 *
 * Sections with no term in common cannot conflict no matter what their periods
 * say — the first check in the legacy `hasConflictsNoCache`.
 */
export function shareAnyTerm(termsA: readonly TermName[], termsB: readonly TermName[]): boolean {
  return termsA.some((term) => termsB.includes(term));
}

/** Header text above each week grid and time table, e.g. "A-Term". */
export function formatTermLabel(term: TermName): string {
  return `${term}-Term`;
}

/** Calendar position, 0-based. Used to stripe overlapping terms in thumbnails. */
export function termIndex(term: TermName): number {
  return TERM_NAMES.indexOf(term);
}
