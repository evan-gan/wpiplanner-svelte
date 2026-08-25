<!--
  The A/B/C/D squares beside a course.

  One component covers both legacy classes: `TermView` (read-only, in the course
  list) and `TermViewSelection` (clickable, in the Courses box and the Schedules
  rail). The colours are the ones the old widgets set inline.
-->
<script lang="ts">
  import { courseAvailabilityForTerm } from '$lib/model/availability';
  import type { CourseJson, TermName } from '$lib/model/schedb';
  import { TERM_NAMES } from '$lib/model/terms';

  interface Props {
    course: CourseJson;
    /** Clickable, and shows the red "term switched off" state. */
    interactive?: boolean;
    /** Whether each term is currently switched off. Only read when interactive. */
    isTermDenied?: (term: TermName) => boolean;
    ontoggle?: (term: TermName) => void;
  }

  let { course, interactive = false, isTermDenied, ontoggle }: Props = $props();

  interface Badge {
    term: TermName;
    state: 'not-offered' | 'denied' | 'open' | 'waitlist' | 'full';
    title: string;
  }

  const badges = $derived<Badge[]>(
    TERM_NAMES.map((term) => {
      const availability = courseAvailabilityForTerm(course.sections, term);

      if (availability === 'not-offered') {
        return { term, state: 'not-offered', title: `Course not offered during ${term} Term.` };
      }

      if (interactive && isTermDenied?.(term) === true) {
        return { term, state: 'denied', title: `${term} Term is switched off. Click to enable.` };
      }

      const titles = {
        open: `Seats available during ${term} Term.`,
        waitlist: `There are no seats left, but there are spots left on the waitlist during ${term} Term.`,
        full: `There are no seats left during ${term} Term.`,
      } as const;

      return { term, state: availability, title: titles[availability] };
    }),
  );

  function canClick(badge: Badge): boolean {
    return interactive && badge.state !== 'not-offered';
  }
</script>

<div class="term-badges">
  {#each badges as badge (badge.term)}
    {#if canClick(badge)}
      <button
        type="button"
        class="badge {badge.state}"
        title={badge.title}
        aria-pressed={badge.state !== 'denied'}
        onclick={(event) => {
          event.stopPropagation();
          ontoggle?.(badge.term);
        }}
      >
        {badge.term}
      </button>
    {:else}
      <span class="badge {badge.state}" title={badge.title}>{badge.term}</span>
    {/if}
  {/each}
</div>

<style>
  .term-badges {
    display: flex;
    gap: var(--space-1);
  }

  .badge {
    display: inline-block;
    margin: var(--space-1);
    padding: var(--space-1) 6px;
    border: 1px solid grey;
    border-radius: var(--radius-lg);
    background: transparent;
    font: inherit;
    line-height: 1;
    color: var(--text);
  }

  button.badge {
    cursor: pointer;
  }

  .not-offered {
    opacity: var(--term-not-offered-opacity);
  }

  .open {
    background: var(--term-open);
  }

  .waitlist {
    background: var(--term-waitlist);
  }

  .full {
    background: var(--term-full);
  }

  .denied {
    background: var(--term-denied);
  }
</style>
