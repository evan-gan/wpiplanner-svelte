<!--
  Shown when no schedule exists: what would have to change for one to.

  Ported from `ConflictResolverWidget`, escalation and all. A second search runs
  over the same courses with a budget of one "problem", and if that still finds
  nothing the budget grows by one, up to ten — each step allowing a longer chain
  of changes before giving up.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import {
    problemDescription,
    problemListsEqual,
    problemTitle,
  } from '$lib/scheduling/problems';
  import type { ChosenTimes, CourseSectionLists, Problem, SchedulePermutation } from '$lib/scheduling/types';
  import { GeneratorClient } from '$lib/scheduling/worker/client';

  interface Props {
    catalog: Catalog;
    courses: CourseSectionLists;
    chosenTimes: ChosenTimes;
    onapply: (problems: readonly Problem[]) => void;
  }

  let { catalog, courses, chosenTimes, onapply }: Props = $props();

  /** The escalation ceiling, straight from the legacy widget. */
  const MAX_SOLUTIONS = 10;

  let attempt = $state(1);
  let suggestions = $state<SchedulePermutation[]>([]);
  let searching = $state(false);
  let client: GeneratorClient | undefined;

  const naming = {
    courseTitle: (courseId: string) => catalog.courseTitle(courseId),
    courseAbbrev: (courseId: string) => catalog.courseAbbrev(courseId),
  };

  const hasCourses = $derived(courses.some((sections) => sections.length > 0));

  /** Distinct advice: two suggestions with the same problem list are one. */
  function addDistinct(found: SchedulePermutation[]): SchedulePermutation[] {
    const distinct: SchedulePermutation[] = [];

    for (const candidate of found) {
      if (candidate.problems.length === 0) continue;
      const seen = distinct.some((existing) =>
        problemListsEqual(existing.problems, candidate.problems),
      );
      if (!seen) distinct.push(candidate);
    }

    return distinct;
  }

  function search(maxSolutions: number) {
    if (client === undefined) client = new GeneratorClient();

    attempt = maxSolutions;
    searching = true;
    const found: SchedulePermutation[] = [];

    client.generate({
      courses,
      chosenTimes,
      maxSolutions,
      onBatch: (batch) => found.push(...batch),
      onDone: (_total, completed) => {
        if (!completed) return;
        searching = false;
        suggestions = addDistinct(found);

        // Nothing at this budget: allow one more change and try again.
        if (suggestions.length === 0 && maxSolutions < MAX_SOLUTIONS) search(maxSolutions + 1);
      },
      onError: () => {
        searching = false;
      },
    });
  }

  $effect(() => {
    // Restart whenever the courses or the blocked times change.
    void courses;
    void chosenTimes;

    suggestions = [];
    if (hasCourses) search(1);

    return () => client?.cancel();
  });

  $effect(() => () => client?.terminate());
</script>

<div class="resolver">
  <h2>No schedules can be generated. :(<br />We are finding a few solutions.</h2>

  {#if !hasCourses}
    <p>There are no courses selected. Add a course/enable a section of a course first.</p>
  {:else if suggestions.length === 0}
    <p role="status">Attempting to find solution with {attempt} step{attempt === 1 ? '' : 's'}.</p>
  {:else}
    <ul>
      {#each suggestions as suggestion, index (index)}
        <li>
          <div class="titles">
            {#each suggestion.problems as problem, problemIndex (problemIndex)}
              <div>{problemTitle(problem, naming)}</div>
            {/each}
          </div>
          <div class="descriptions">
            {#each suggestion.problems as problem, problemIndex (problemIndex)}
              <div>
                {#each problemDescription(problem, naming) as line, lineIndex (lineIndex)}
                  <div>{line}</div>
                {/each}
              </div>
            {/each}
          </div>
          <button type="button" onclick={() => onapply(suggestion.problems)}>APPLY!</button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if searching && suggestions.length > 0}
    <p class="still-looking">Still looking for more...</p>
  {/if}
</div>

<style>
  .resolver {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    padding: var(--space-3);
  }

  h2 {
    text-align: center;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
    margin: var(--space-2);
  }

  .titles {
    font-weight: bold;
  }

  .descriptions {
    margin-left: 20px;
  }

  button {
    margin-top: var(--space-2);
    padding: 3px 5px;
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface-alt);
    cursor: pointer;
    font: inherit;
  }

  .still-looking {
    color: var(--text-muted);
    font-size: var(--font-size-small);
    text-align: center;
  }
</style>
