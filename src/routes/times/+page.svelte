<!--
  The Times tab: block out the half-hour slots you cannot have class.

  A blocked slot removes every section that meets in it from the Schedules tab.
  The grid covers Monday-Friday, 8:00AM-6:00PM; anything outside those bounds is
  always treated as available, because the grid gives no way to say otherwise.
-->
<script lang="ts">
  import TermTimeTabs from '$lib/components/times/TermTimeTabs.svelte';
  import { getAppState } from '$lib/state/app.svelte';

  const app = getAppState();
</script>

<div class="times">
  <p class="hint">
    Drag across the grid to block out times you cannot have class. Blocked times are shown in pink,
    and any section meeting during one is left out of your schedules.
  </p>

  <div class="grids">
    <TermTimeTabs
      times={app.chosenTimes.times}
      ondrag={(term, anchor, drop) => app.applyChosenTimesDrag(term, anchor, drop)}
    />
  </div>
</div>

<style>
  .times {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }

  .hint {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-small);
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-subtle);
  }

  .grids {
    flex: 1 1 auto;
    min-height: 0;
  }
</style>
