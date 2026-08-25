<!--
  The four term grids.

  On a wide screen they sit in a 2x2 block, as `TimeTablesGrid` laid them out
  (A B / C D). On a narrow one they become a single grid with a term switcher,
  because four grids at phone width are unreadable.
-->
<script lang="ts">
  import type { TermName } from '$lib/model/schedb';
  import { TERM_NAMES, formatTermLabel } from '$lib/model/terms';
  import type { ChosenTimes } from '$lib/scheduling/types';
  import TimeGrid from './TimeGrid.svelte';

  interface Cell {
    row: number;
    column: number;
  }

  interface Props {
    times: ChosenTimes;
    ondrag: (term: TermName, anchor: Cell, drop: Cell) => void;
  }

  let { times, ondrag }: Props = $props();

  let activeTerm = $state<TermName>('A');
</script>

<div class="term-tabs">
  <div class="switcher" role="tablist" aria-label="Term">
    {#each TERM_NAMES as term (term)}
      <button
        type="button"
        role="tab"
        aria-selected={activeTerm === term}
        class:active={activeTerm === term}
        onclick={() => (activeTerm = term)}
      >
        {formatTermLabel(term)}
      </button>
    {/each}
  </div>

  <div class="grids">
    {#each TERM_NAMES as term (term)}
      <div class="grid-cell" class:active={activeTerm === term}>
        <TimeGrid
          {term}
          cells={times[term]}
          ondrag={(anchor, drop) => ondrag(term, anchor, drop)}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .term-tabs {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .grids {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 10px;
  }

  .grid-cell {
    min-height: 0;
    min-width: 0;
  }

  /* The switcher only matters once the grids stop fitting side by side. */
  .switcher {
    display: none;
    gap: var(--space-2);
  }

  .switcher button {
    flex: 1 1 0;
    padding: var(--space-2);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    font: inherit;
  }

  .switcher button.active {
    background: var(--wpi-crimson);
    color: var(--text-on-brand);
  }

  @media (max-width: 900px), (max-height: 620px) {
    .switcher {
      display: flex;
    }

    .grids {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr;
    }

    .grid-cell {
      display: none;
    }

    .grid-cell.active {
      display: block;
    }
  }
</style>
