<!--
  The left rail: one collapsible group per chosen course, with a checkbox per
  section and its professor.

  Ported from `StudentCourseList` + `CourseItem` + `SectionCheckbox` +
  `PeriodSelectList`. Hovering a section previews it on the grid, clicking the
  professor opens the section details — both behaviours of the old rail.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import { sectionAvailability } from '$lib/model/availability';
  import type { TermName } from '$lib/model/schedb';
  import { buildSectionFilters } from '$lib/model/sectionFilters';
  import TermBadges from '$lib/components/catalog/TermBadges.svelte';
  import FilterMenu from '$lib/components/primitives/FilterMenu.svelte';
  import WarningIcon from '$lib/components/primitives/WarningIcon.svelte';

  interface Props {
    catalog: Catalog;
    courseIds: string[];
    isSectionDenied: (courseId: string, sectionId: string) => boolean;
    isTermDenied: (courseId: string, term: TermName) => boolean;
    /** Sections of the schedule on screen, highlighted in their course colour. */
    scheduledSectionIds: string[];
    colorOf: (courseId: string) => string;
    ontoggleSection: (courseId: string, sectionId: string) => void;
    /** Switches a filter option's sections on or off in one go. */
    onsetSectionsDenied: (courseId: string, sectionIds: string[], denied: boolean) => void;
    ontoggleTerm: (courseId: string, term: TermName) => void;
    onhighlight: (sectionId: string | null) => void;
    onshowDetails: (sectionId: string) => void;
  }

  let {
    catalog,
    courseIds,
    isSectionDenied,
    isTermDenied,
    scheduledSectionIds,
    colorOf,
    ontoggleSection,
    onsetSectionsDenied,
    ontoggleTerm,
    onhighlight,
    onshowDetails,
  }: Props = $props();

  /** The first course starts expanded, as `StudentCourseList` did. */
  let expanded = $state<Record<string, boolean>>({});

  $effect(() => {
    if (courseIds.length > 0 && expanded[courseIds[0]] === undefined) {
      expanded = { ...expanded, [courseIds[0]]: true };
    }
  });

  /**
   * A course's filter groups, with each option ticked while any section it
   * covers is still switched on.
   *
   * Derived rather than stored, so the menu can never drift from the section
   * checkboxes below it — unticking every section of a professor by hand
   * unticks the professor too.
   */
  function filterGroupsFor(courseId: string) {
    return buildSectionFilters(catalog.requireCourse(courseId)).map((group) => ({
      ...group,
      options: group.options.map((option) => ({
        value: option.value,
        label: option.label,
        checked: option.sectionIds.some((id) => !isSectionDenied(courseId, id)),
      })),
    }));
  }

  /** Apply one filter tick: every section under that option follows it. */
  function applyFilter(courseId: string, groupId: string, value: string, checked: boolean) {
    const group = buildSectionFilters(catalog.requireCourse(courseId)).find(
      (candidate) => candidate.id === groupId,
    );
    const option = group?.options.find((candidate) => candidate.value === value);
    if (option === undefined) return;

    onsetSectionsDenied(courseId, option.sectionIds, !checked);
  }

  function professorOf(sectionId: string): string {
    const periods = catalog.getSection(sectionId)?.periods ?? [];
    return periods[0]?.professor ?? 'Unknown';
  }
</script>

<div class="rail">
  {#each courseIds as courseId (courseId)}
    {@const course = catalog.requireCourse(courseId)}
    <section class="course">
      <div class="course-header">
        <button
          type="button"
          class="collapse"
          aria-expanded={expanded[courseId] === true}
          onclick={() => (expanded = { ...expanded, [courseId]: expanded[courseId] !== true })}
        >
          {expanded[courseId] === true ? '▼' : '▶'}
        </button>
        <FilterMenu
          title="Filter sections"
          groups={filterGroupsFor(courseId)}
          ontoggle={(groupId, value, checked) => applyFilter(courseId, groupId, value, checked)}
        />
        <span class="abbrev">{catalog.courseAbbrev(courseId)}</span>
        <TermBadges
          {course}
          interactive
          isTermDenied={(term) => isTermDenied(courseId, term)}
          ontoggle={(term) => ontoggleTerm(courseId, term)}
        />
      </div>

      {#if expanded[courseId] === true}
        <ul class="sections">
          {#each course.sections as section (section.id)}
            <li
              style:background-color={scheduledSectionIds.includes(section.id)
                ? colorOf(courseId)
                : undefined}
              onpointerenter={() => onhighlight(section.id)}
              onpointerleave={() => onhighlight(null)}
            >
              <label>
                <input
                  type="checkbox"
                  checked={!isSectionDenied(courseId, section.id)}
                  onchange={() => ontoggleSection(courseId, section.id)}
                />
                <span class="number">{section.number}</span>
                <WarningIcon availability={sectionAvailability(section)} />
              </label>
              <button
                type="button"
                class="professor"
                title="Show details for section {section.number}"
                onclick={() => onshowDetails(section.id)}
              >
                {professorOf(section.id)}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}

  {#if courseIds.length === 0}
    <p class="empty">Add a course on the Courses tab to see schedules.</p>
  {/if}
</div>

<style>
  .rail {
    padding: var(--space-1);
  }

  .course {
    border-bottom: 1px solid var(--text);
    width: 100%;
  }

  .course-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1);
  }

  .abbrev {
    flex: 1 1 auto;
    text-align: center;
    font-weight: bold;
  }

  .collapse {
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    line-height: 1;
    padding: 2px 5px;
  }

  .sections {
    list-style: none;
    margin: 0;
    padding: 0 0 var(--space-2) var(--space-3);
  }

  .sections li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 1px var(--space-2);
  }

  .sections li:hover {
    background: var(--surface-alt);
  }

  label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    cursor: pointer;
    min-width: 0;
  }

  .number {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .professor {
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--font-size-small);
    color: inherit;
    cursor: pointer;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 50%;
  }

  .professor:hover::after {
    content: '→';
  }

  .empty {
    padding: var(--space-3);
    color: var(--text-muted);
    font-size: var(--font-size-small);
  }
</style>
