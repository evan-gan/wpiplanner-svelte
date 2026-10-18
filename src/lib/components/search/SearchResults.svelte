<!--
  The two result boxes under the header search: classes on the left, professors
  (each with the classes they teach) on the right.

  Two boxes rather than one mixed list because a query like "kadam" is only ever
  a person and "calc" only ever a class; keeping them apart lets each box say
  plainly what it found, or that it found nothing.
-->
<script lang="ts">
  import type { SearchResults } from '$lib/model/catalogSearch';
  import SearchResultCourse from './SearchResultCourse.svelte';

  interface Props {
    results: SearchResults;
    isChosen: (courseId: string) => boolean;
    onopen: (courseId: string) => void;
    ontoggleChosen: (courseId: string) => void;
  }

  let { results, isChosen, onopen, ontoggleChosen }: Props = $props();

  /** A professor teaching a dozen classes should not push the box off screen. */
  const COURSES_SHOWN_PER_PROFESSOR = 5;
</script>

<div class="boxes">
  <section class="box">
    <h3>Classes</h3>
    {#each results.courses as hit (hit.courseId)}
      <SearchResultCourse
        {hit}
        chosen={isChosen(hit.courseId)}
        onopen={() => onopen(hit.courseId)}
        ontoggleChosen={() => ontoggleChosen(hit.courseId)}
      />
    {:else}
      <p class="none">No classes match.</p>
    {/each}
    {#if results.totalCourses > results.courses.length}
      <p class="more">+{results.totalCourses - results.courses.length} more — keep typing to narrow</p>
    {/if}
  </section>

  <section class="box">
    <h3>Professors</h3>
    {#each results.professors as professor (professor.name)}
      <div class="professor">
        <div class="professor-name">{professor.name}</div>
        {#each professor.courses.slice(0, COURSES_SHOWN_PER_PROFESSOR) as hit (hit.courseId)}
          <SearchResultCourse
            {hit}
            chosen={isChosen(hit.courseId)}
            onopen={() => onopen(hit.courseId)}
            ontoggleChosen={() => ontoggleChosen(hit.courseId)}
          />
        {/each}
        {#if professor.courses.length > COURSES_SHOWN_PER_PROFESSOR}
          <p class="more">+{professor.courses.length - COURSES_SHOWN_PER_PROFESSOR} more classes</p>
        {/if}
      </div>
    {:else}
      <p class="none">No professors match.</p>
    {/each}
    {#if results.totalProfessors > results.professors.length}
      <p class="more">+{results.totalProfessors - results.professors.length} more — keep typing to narrow</p>
    {/if}
  </section>
</div>

<style>
  .boxes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    align-items: start;
  }

  .box {
    background: var(--surface);
    color: var(--text);
    border-radius: var(--radius-md);
    padding: var(--space-2) 0;
    max-height: min(60vh, 420px);
    overflow-y: auto;
    min-width: 0;
  }

  h3 {
    margin: 0 0 var(--space-2);
    padding: 0 var(--space-3);
    font-size: var(--font-size-small);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .professor {
    padding-bottom: var(--space-2);
  }

  .professor-name {
    padding: 0 var(--space-3);
    font-weight: bold;
  }

  .none,
  .more {
    margin: 0;
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  @media (max-width: 700px) {
    .boxes {
      grid-template-columns: 1fr;
    }
  }
</style>
