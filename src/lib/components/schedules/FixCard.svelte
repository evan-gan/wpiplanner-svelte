<!--
  One way to make a clicked section fit: headline tags, then each course that
  changes, in the order the changes happen (`describeFix`).

  Hovering the card previews the whole schedule on the calendar; "Use this"
  applies it, switching on any unchecked sections it needs.
-->
<script lang="ts">
  import type { CourseChange, FixCardModel } from '$lib/scheduling/fixDescription';

  interface Props {
    card: FixCardModel;
    onpreview: (on: boolean) => void;
    onapply: () => void;
  }

  let { card, onpreview, onapply }: Props = $props();

  let showFolded = $state(false);
  const changes = $derived(showFolded ? [...card.shown, ...card.folded] : card.shown);
</script>

{#snippet courseChange(change: CourseChange)}
  <li class="course">
    <div class="course-head">
      <span class="label">{change.label}</span>
      {#each change.tags as tag (tag)}
        <span class="tag">({tag})</span>
      {/each}
      {#if change.makesRoomFor !== null}
        <span class="cascade">{change.makesRoomFor}</span>
      {/if}
    </div>
    {#each change.lines as line (line.type + line.to)}
      <div class="line">
        <span class="type">{line.type}</span>
        <span class="times">
          <span class="from">{line.from}</span>
          <span class="arrow" aria-label="changes to">→</span>
          <span class="to">{line.to}</span>
        </span>
      </div>
      {#if line.note !== null}
        <div class="note">({line.note})</div>
      {/if}
    {/each}
  </li>
{/snippet}

<article
  class="card"
  onpointerenter={() => onpreview(true)}
  onpointerleave={() => onpreview(false)}
>
  <header>
    <div class="headline">
      {#each card.headline as tag (tag)}
        <span class="tag">({tag})</span>
      {/each}
    </div>
    <button type="button" class="apply" onclick={onapply}>Use this</button>
  </header>

  <ul class="changes">
    {#each changes as change (change.courseId)}
      {@render courseChange(change)}
    {/each}
  </ul>

  {#if card.folded.length > 0}
    <button type="button" class="more" onclick={() => (showFolded = !showFolded)}>
      {showFolded
        ? 'Show less'
        : `+${card.folded.length} more ${card.folded.length === 1 ? 'course' : 'courses'} · times only`}
    </button>
  {/if}
</article>

<style>
  .card {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--surface);
    padding: var(--space-2) var(--space-3);
  }

  .card:hover {
    background: var(--surface-alt);
  }

  header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .headline {
    flex: 1 1 auto;
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-2);
    font-weight: bold;
  }

  .tag {
    white-space: nowrap;
  }

  .apply {
    flex: 0 0 auto;
    padding: 2px 8px;
    border: 1px solid var(--wpi-crimson);
    border-radius: var(--radius-sm);
    background: var(--wpi-crimson);
    color: var(--text-on-brand);
    font: inherit;
    font-size: var(--font-size-small);
    cursor: pointer;
  }

  .apply:hover {
    background: var(--wpi-crimson-hover);
  }

  .changes {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .course-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .label {
    font-weight: bold;
    margin-right: var(--space-1);
  }

  .cascade {
    font-size: var(--font-size-small);
    font-style: italic;
    color: var(--text-muted);
  }

  /* Type, then old → new on one line; wraps only on a very narrow screen. */
  .line {
    display: flex;
    gap: var(--space-3);
    padding-left: var(--space-5);
    font-size: var(--font-size-small);
    font-variant-numeric: tabular-nums;
  }

  .type {
    flex: 0 0 5.5em;
    color: var(--text-muted);
  }

  .times {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-2);
    white-space: nowrap;
  }

  .from {
    color: var(--text-muted);
  }

  .to {
    font-weight: bold;
  }

  .note {
    font-size: var(--font-size-small);
    padding-left: calc(var(--space-5) + 5.5em + var(--space-3));
  }

  .more {
    margin-top: var(--space-2);
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: var(--font-size-small);
    color: var(--text-muted);
    cursor: pointer;
    text-decoration: underline;
  }
</style>
