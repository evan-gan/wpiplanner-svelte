<!--
  The browsable course list for the ticked departments.

  Courses are sorted by number, case-insensitively, across all selected
  departments at once — the legacy `CourseList.CourseComparator`, which inserted
  each row at its sorted position as it was added.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import type { CourseJson } from '$lib/model/schedb';
  import CourseRow from './CourseRow.svelte';

  interface Props {
    catalog: Catalog;
    /** Department abbreviations that are ticked in the picker. */
    departments: string[];
    chosenCourseIds: string[];
    selectedCourseId: string | null;
    onselect: (courseId: string) => void;
    ontoggleChosen: (courseId: string) => void;
  }

  let {
    catalog,
    departments,
    chosenCourseIds,
    selectedCourseId,
    onselect,
    ontoggleChosen,
  }: Props = $props();

  const courses = $derived<CourseJson[]>(
    departments
      .flatMap((abbrev) => catalog.getDepartment(abbrev)?.courses ?? [])
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { sensitivity: 'accent' })),
  );
</script>

{#if departments.length === 0}
  <p class="empty">Choose one or more departments on the left to browse their courses.</p>
{:else if courses.length === 0}
  <p class="empty">No courses are listed for the selected departments.</p>
{:else}
  <table class="course-list">
    <tbody>
      {#each courses as course (course.id)}
        <CourseRow
          {course}
          abbrev={catalog.courseAbbrev(course.id)}
          chosen={chosenCourseIds.includes(course.id)}
          selected={selectedCourseId === course.id}
          onselect={() => onselect(course.id)}
          ontoggleChosen={() => ontoggleChosen(course.id)}
        />
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .course-list {
    width: 100%;
    border-spacing: 0;
  }

  .course-list :global(tr:nth-child(even)) {
    background: var(--surface-alt);
  }

  .course-list :global(tr:nth-child(odd)) {
    background: var(--surface);
  }

  .course-list :global(tr:hover) {
    background: var(--surface-hover);
  }

  .empty {
    padding: var(--space-5);
    color: var(--text-muted);
  }
</style>
