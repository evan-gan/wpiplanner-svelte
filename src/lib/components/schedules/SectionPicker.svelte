<!--
  The left rail: one collapsible group per chosen course, listing its lectures
  with each lecture's labs and discussions nested beneath it.

  Ported from `StudentCourseList` + `CourseItem` + `SectionCheckbox` +
  `PeriodSelectList`, which listed every lecture+lab combination as its own
  checkbox; the split into lectures and labs is `CourseComponentList`. Hovering
  a row previews it on the grid, clicking its professor opens the section
  details — both behaviours of the old rail.

  The rail is one CSS grid, and every row below it is a subgrid of it, so the
  section, professor, and time columns line up across all courses.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import type { TermName } from '$lib/model/schedb';
  import TermBadges from '$lib/components/catalog/TermBadges.svelte';
  import CourseComponentList from './CourseComponentList.svelte';

  interface Props {
    catalog: Catalog;
    courseIds: string[];
    isSectionDenied: (courseId: string, sectionId: string) => boolean;
    isTermDenied: (courseId: string, term: TermName) => boolean;
    /** Sections of the schedule on screen, highlighted in their course colour. */
    scheduledSectionIds: string[];
    colorOf: (courseId: string) => string;
    /** Open/closed is owned by the caller so it survives the tab unmounting. */
    isExpanded: (courseId: string) => boolean;
    ontoggleExpanded: (courseId: string) => void;
    /** Switches a group of sections on or off in one go. */
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
    isExpanded,
    ontoggleExpanded,
    onsetSectionsDenied,
    ontoggleTerm,
    onhighlight,
    onshowDetails,
  }: Props = $props();
</script>

<div class="rail">
  {#each courseIds as courseId (courseId)}
    {@const course = catalog.requireCourse(courseId)}
    <section class="course">
      <div class="course-header">
        <button
          type="button"
          class="collapse"
          aria-expanded={isExpanded(courseId)}
          onclick={() => ontoggleExpanded(courseId)}
        >
          {isExpanded(courseId) ? '▼' : '▶'}
        </button>
        <span class="abbrev">{catalog.courseAbbrev(courseId)}</span>
        <TermBadges
          {course}
          interactive
          isTermDenied={(term) => isTermDenied(courseId, term)}
          ontoggle={(term) => ontoggleTerm(courseId, term)}
        />
      </div>

      {#if isExpanded(courseId)}
        <CourseComponentList
          {course}
          isSectionDenied={(sectionId) => isSectionDenied(courseId, sectionId)}
          {scheduledSectionIds}
          color={colorOf(courseId)}
          onsetSectionsDenied={(sectionIds, denied) =>
            onsetSectionsDenied(courseId, sectionIds, denied)}
          {onhighlight}
          {onshowDetails}
        />
      {/if}
    </section>
  {/each}

  {#if courseIds.length === 0}
    <p class="empty">Add a course on the Courses tab to see schedules.</p>
  {/if}
</div>

<style>
  /*
    Columns: checkbox + section label (capped so "Interest List-A Term" cannot
    take over), professor (takes the slack, truncates), meeting times.
  */
  .rail {
    display: grid;
    grid-template-columns: fit-content(9em) minmax(0, 1fr) max-content;
    column-gap: var(--space-3);
    padding: var(--space-1);
  }

  .course {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    border-bottom: 1px solid var(--text);
  }

  .course-header {
    grid-column: 1 / -1;
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

  .empty {
    grid-column: 1 / -1;
    padding: var(--space-3);
    color: var(--text-muted);
    font-size: var(--font-size-small);
  }
</style>
