<!--
  The "Import from Workday" toolbar button and its review dialog.

  Unlike the three buttons beside it this is an action rather than a view: the
  import has to be reachable when the pane is showing the conflict resolver or
  the progress bar, which is exactly the state a student with no courses chosen
  is in.

  Nothing is applied until the student confirms. The dialog shows what matched
  and what did not first, because the import replaces the whole selection.
-->
<script lang="ts">
  import Modal from '$lib/components/primitives/Modal.svelte';
  import ToggleButton from '$lib/components/primitives/ToggleButton.svelte';
  import type { Catalog } from '$lib/model/catalog';
  import { readWorkdayExport, type EnrollmentMatch, type MatchedCourse } from '$lib/workday';

  interface Props {
    catalog: Catalog;
    /** Applies the confirmed sections and reports how many courses were kept. */
    onimport: (sections: readonly MatchedCourse[]) => number;
  }

  let { catalog, onimport }: Props = $props();

  type Stage =
    | { kind: 'closed' }
    | { kind: 'reading' }
    | { kind: 'review'; match: EnrollmentMatch }
    | { kind: 'imported'; count: number; skipped: number }
    | { kind: 'error'; message: string };

  let stage = $state<Stage>({ kind: 'closed' });
  let fileInput: HTMLInputElement | undefined = $state();

  async function onFileChosen(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];

    // Let the same file be picked again after a cancel or a failed read.
    input.value = '';
    if (file === undefined) return;

    stage = { kind: 'reading' };

    try {
      const match = await readWorkdayExport(await file.arrayBuffer(), catalog);
      stage =
        match.matched.length === 0 && match.unmatched.length === 0
          ? {
              kind: 'error',
              message:
                `No enrolled courses were found in "${file.name}". Make sure it is the ` +
                `spreadsheet exported from Workday's View My Courses screen.`,
            }
          : { kind: 'review', match };
    } catch (cause) {
      stage = { kind: 'error', message: cause instanceof Error ? cause.message : String(cause) };
    }
  }

  function confirmImport(match: EnrollmentMatch) {
    const count = onimport(match.matched);
    stage = { kind: 'imported', count, skipped: match.matched.length - count };
  }

  const dialogOpen = $derived(stage.kind !== 'closed');
</script>

<ToggleButton
  pressed={dialogOpen}
  title="Load the courses you are registered for from a Workday export"
  onclick={() => fileInput?.click()}
>
  Import from Workday
</ToggleButton>

<input
  bind:this={fileInput}
  type="file"
  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  onchange={onFileChosen}
  hidden
/>

<Modal open={dialogOpen} onclose={() => (stage = { kind: 'closed' })}>
  {#snippet title()}Import from Workday{/snippet}

  {#if stage.kind === 'reading'}
    <p>Reading the workbook…</p>
  {:else if stage.kind === 'error'}
    <p class="error" role="alert">{stage.message}</p>
    <div class="actions">
      <button type="button" onclick={() => fileInput?.click()}>Choose another file</button>
      <button type="button" onclick={() => (stage = { kind: 'closed' })}>Close</button>
    </div>
  {:else if stage.kind === 'imported'}
    <p>
      Imported {stage.count}
      {stage.count === 1 ? 'course' : 'courses'}. Only the sections you are registered for are
      switched on, so the Schedules tab now shows your registered schedule.
    </p>
    {#if stage.skipped > 0}
      <p class="warning">
        {stage.skipped} more could not be added — the planner holds at most 18 courses.
      </p>
    {/if}
    <p class="hint">
      If no schedule appears, check the Times tab: a meeting that falls inside a time you have
      blocked off makes the schedule impossible.
    </p>
    <div class="actions">
      <button type="button" onclick={() => (stage = { kind: 'closed' })}>Done</button>
    </div>
  {:else if stage.kind === 'review'}
    {@const match = stage.match}
    {#if match.matched.length > 0}
      <p>These registered sections will be loaded:</p>
      <ul class="matched">
        {#each match.matched as course (course.sectionId)}
          <li>
            <strong>{course.enrolled.deptAbbrev} {course.enrolled.courseNumber}</strong>
            section {course.sectionNumber}
            {#if course.enrolled.title !== ''}<span class="title">— {course.enrolled.title}</span>{/if}
            {#if course.partial}
              <span class="warning">(matched on some of its meetings — check it)</span>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="warning">None of the courses in that export could be matched to the catalog.</p>
    {/if}

    {#if match.unmatched.length > 0}
      <p class="warning">Left out:</p>
      <ul class="unmatched">
        {#each match.unmatched as course, index (index)}
          <li>{course.reason}</li>
        {/each}
      </ul>
    {/if}

    <p class="hint">This replaces the courses you have chosen now.</p>

    <div class="actions">
      <button
        type="button"
        class="primary"
        disabled={match.matched.length === 0}
        onclick={() => confirmImport(match)}
      >
        Import {match.matched.length}
        {match.matched.length === 1 ? 'course' : 'courses'}
      </button>
      <button type="button" onclick={() => (stage = { kind: 'closed' })}>Cancel</button>
    </div>
  {/if}
</Modal>

<style>
  p {
    margin: 0 0 var(--space-3);
  }

  ul {
    margin: 0 0 var(--space-3);
    padding-left: var(--space-5);
  }

  li {
    margin-bottom: var(--space-1);
  }

  .title {
    color: var(--text-muted);
  }

  .hint {
    color: var(--text-muted);
    font-size: small;
  }

  .error,
  .warning {
    color: var(--warn-full);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .actions button {
    padding: 4px 10px;
    cursor: pointer;
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface-alt);
  }

  .actions button:hover:not(:disabled) {
    background: var(--surface-hover);
  }

  .actions button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
