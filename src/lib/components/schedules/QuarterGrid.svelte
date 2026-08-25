<!--
  All four terms at once, in a 2x2 block: A B on top, C D below.

  `GridCourseView` built this out of an absolutely positioned table; it is a CSS
  grid here, and each cell is the same `WeekGrid` the single-term view uses.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import type { TermName } from '$lib/model/schedb';
  import { TERM_NAMES } from '$lib/model/terms';
  import type { TimeRangeState } from '$lib/state/timeRange.svelte';
  import WeekGrid from './WeekGrid.svelte';

  interface Props {
    catalog: Catalog;
    sectionIds: string[];
    highlightedSectionId: string | null;
    timeRange: TimeRangeState;
    colorOf: (courseId: string) => string;
    onselect: (sectionId: string) => void;
  }

  let { catalog, sectionIds, highlightedSectionId, timeRange, colorOf, onselect }: Props = $props();

  const terms: TermName[][] = TERM_NAMES.map((term) => [term]);
</script>

<div class="quarters">
  {#each terms as termPair (termPair[0])}
    <div class="quarter">
      <WeekGrid
        {catalog}
        terms={termPair}
        {sectionIds}
        {highlightedSectionId}
        {timeRange}
        {colorOf}
        {onselect}
      />
    </div>
  {/each}
</div>

<style>
  .quarters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    height: 100%;
    width: 100%;
  }

  .quarter {
    border: 1px solid var(--border-panel);
    border-radius: var(--radius-md);
    overflow: hidden;
    margin: 1px;
    min-width: 0;
    min-height: 0;
  }

  @media (max-width: 700px) {
    .quarters {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(4, minmax(240px, 1fr));
      overflow-y: auto;
    }
  }
</style>
