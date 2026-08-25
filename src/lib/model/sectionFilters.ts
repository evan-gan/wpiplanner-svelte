/**
 * Filters that narrow a course's sections by some property they carry.
 *
 * A filter is only a *view* over the sections: it owns no state of its own.
 * Each option names the sections it covers, and the UI decides an option is
 * ticked when any of those sections is still switched on. That way the filter
 * menu and the section checkboxes can never disagree — there is one source of
 * truth, the denied-section list in `SelectionState`.
 *
 * Adding a filter is adding a builder to `SECTION_FILTER_BUILDERS`; nothing
 * else in the app needs to know what a particular filter means.
 */
import type { CourseJson, SectionJson } from './schedb.ts';

export interface SectionFilterOption {
  /** Stable identity within its group, used as the key and in callbacks. */
  value: string;
  label: string;
  /** Every section of the course this option covers. Never empty. */
  sectionIds: string[];
}

export interface SectionFilterGroup {
  id: string;
  label: string;
  options: SectionFilterOption[];
}

export type SectionFilterBuilder = (course: CourseJson) => SectionFilterGroup;

/** Shown for a section whose periods carry no professor name. */
export const UNKNOWN_PROFESSOR = 'Unknown';

/**
 * Group sections by a label derived from each one, preserving first-seen order.
 *
 * A section may yield several labels — a lecture and a lab with different
 * professors — in which case it appears under each of them.
 */
function groupSectionsBy(
  sections: readonly SectionJson[],
  labelsOf: (section: SectionJson) => string[],
): SectionFilterOption[] {
  const byLabel = new Map<string, SectionFilterOption>();

  for (const section of sections) {
    for (const label of labelsOf(section)) {
      const existing = byLabel.get(label);
      if (existing === undefined) {
        byLabel.set(label, { value: label, label, sectionIds: [section.id] });
      } else if (!existing.sectionIds.includes(section.id)) {
        existing.sectionIds.push(section.id);
      }
    }
  }

  return [...byLabel.values()];
}

function professorNames(section: SectionJson): string[] {
  const names = section.periods
    .map((period) => period.professor.trim())
    .filter((professor) => professor !== '');

  return names.length > 0 ? [...new Set(names)] : [UNKNOWN_PROFESSOR];
}

const professorFilter: SectionFilterBuilder = (course) => ({
  id: 'professor',
  label: 'Professors',
  options: groupSectionsBy(course.sections, professorNames),
});

/** Every filter the section rail offers, in the order they are shown. */
export const SECTION_FILTER_BUILDERS: SectionFilterBuilder[] = [professorFilter];

/**
 * Build the filter groups for one course.
 *
 * A group with nothing to choose between — every section shares the one value —
 * is dropped, because ticking it off would just switch the whole course off and
 * the course header already does that.
 */
export function buildSectionFilters(course: CourseJson): SectionFilterGroup[] {
  return SECTION_FILTER_BUILDERS.map((build) => build(course)).filter(
    (group) => group.options.length > 1,
  );
}
