<!--
  The "Courses" box: what the student has chosen, with clickable term badges.

  The legacy `CourseSelection` animated a removed row into an "undo" strip that
  faded after three seconds. That is kept, as an inline undo the student can
  click, because removing the wrong course is easy and re-finding it is not.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import type { TermName } from '$lib/model/schedb';
  import { slide } from 'svelte/transition';
  import TermBadges from './TermBadges.svelte';

  interface Props {
    catalog: Catalog;
    courseIds: string[];
    isTermDenied: (courseId: string, term: TermName) => boolean;
    ontoggleTerm: (courseId: string, term: TermName) => void;
    onremove: (courseId: string) => void;
    onselect: (courseId: string) => void;
    /** Re-adds a course the student just removed. */
    onundo: (courseId: string) => void;
  }

  let {
    catalog,
    courseIds,
    isTermDenied,
    ontoggleTerm,
    onremove,
    onselect,
    onundo,
  }: Props = $props();

  /** How long the undo strip stays, matching the legacy 3s animation delay. */
  const UNDO_TIMEOUT_MS = 3000;

  let recentlyRemoved = $state<string | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;

  function remove(courseId: string) {
    onremove(courseId);
    recentlyRemoved = courseId;

    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => (recentlyRemoved = null), UNDO_TIMEOUT_MS);
  }

  function undo() {
    if (recentlyRemoved === null) return;
    onundo(recentlyRemoved);
    recentlyRemoved = null;
  }
</script>

<table class="chosen">
  <tbody>
    {#each courseIds as courseId (courseId)}
      {@const course = catalog.requireCourse(courseId)}
      <tr transition:slide={{ duration: 150 }}>
        <td class="remove">
          <button
            type="button"
            aria-label="Remove {catalog.courseAbbrev(courseId)}"
            title="Remove {catalog.courseAbbrev(courseId)}"
            onclick={() => remove(courseId)}
          >
            −
          </button>
        </td>
        <td class="abbrev">
          <button type="button" class="link" onclick={() => onselect(courseId)}>
            {catalog.courseAbbrev(courseId)}
          </button>
        </td>
        <td class="terms">
          <TermBadges
            {course}
            interactive
            isTermDenied={(term) => isTermDenied(courseId, term)}
            ontoggle={(term) => ontoggleTerm(courseId, term)}
          />
        </td>
      </tr>
    {/each}

    {#if recentlyRemoved !== null}
      <tr class="undo">
        <td colspan="3">
          <button type="button" onclick={undo}>
            Course removed. Click to add {catalog.courseAbbrev(recentlyRemoved)} back
          </button>
        </td>
      </tr>
    {/if}

    {#if courseIds.length === 0 && recentlyRemoved === null}
      <tr>
        <td colspan="3" class="empty">No courses chosen yet.</td>
      </tr>
    {/if}
  </tbody>
</table>

<style>
  .chosen {
    width: 100%;
    border-spacing: 0;
  }

  .chosen tr:nth-child(even) {
    background: var(--surface-alt);
  }

  td {
    padding: 3px;
  }

  .remove {
    width: 36px;
    text-align: center;
  }

  .remove button {
    width: 22px;
    height: 22px;
    line-height: 1;
    cursor: pointer;
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }

  .abbrev {
    width: 100px;
    text-align: center;
  }

  .link {
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
    text-decoration: underline;
  }

  .undo td {
    text-align: center;
  }

  .undo button {
    width: 100%;
    padding: var(--space-2);
    border: 1px dashed var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    font: inherit;
  }

  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-3);
  }
</style>
