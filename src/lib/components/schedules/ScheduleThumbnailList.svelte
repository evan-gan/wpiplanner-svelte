<!--
  The scrolling strip of schedule sketches, with the Favorites toggle on top.

  Thumbnails are added 20 at a time as the strip is scrolled, which is what
  `PermutationCanvasList.updateThumbnails` did — drawing three hundred canvases
  up front costs more than anyone scrolls through.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import ScrollArea from '$lib/components/primitives/ScrollArea.svelte';
  import ToggleButton from '$lib/components/primitives/ToggleButton.svelte';
  import type { SchedulePermutation } from '$lib/scheduling/types';
  import type { TimeRangeState } from '$lib/state/timeRange.svelte';
  import ScheduleThumbnail from './ScheduleThumbnail.svelte';

  interface Props {
    catalog: Catalog;
    permutations: SchedulePermutation[];
    favorites: SchedulePermutation[];
    timeRange: TimeRangeState;
    colorOf: (courseId: string) => string;
    isSelected: (permutation: SchedulePermutation) => boolean;
    onselect: (permutation: SchedulePermutation) => void;
    /** True once the search has stopped, so "none found" is meaningful. */
    finished: boolean;
  }

  let {
    catalog,
    permutations,
    favorites,
    timeRange,
    colorOf,
    isSelected,
    onselect,
    finished,
  }: Props = $props();

  const PAGE_SIZE = 20;

  let showingFavorites = $state(false);
  let visibleCount = $state(PAGE_SIZE);

  const shown = $derived(
    showingFavorites ? favorites : permutations.slice(0, visibleCount),
  );

  /** A new set of results starts the strip over at the top of the list. */
  $effect(() => {
    void permutations;
    visibleCount = PAGE_SIZE;
  });

  function showMore() {
    if (showingFavorites) return;
    if (visibleCount >= permutations.length) return;
    visibleCount += PAGE_SIZE;
  }
</script>

<div class="strip">
  <div class="header">
    <ToggleButton
      pressed={showingFavorites}
      onclick={() => (showingFavorites = !showingFavorites)}
      title="Show only the schedules you have starred"
    >
      Favorites ({favorites.length})
    </ToggleButton>
  </div>

  <div class="list">
    <ScrollArea onscrollnearend={showMore}>
      {#each shown as permutation, index (permutation.sectionIds.join('+') + index)}
        <ScheduleThumbnail
          {catalog}
          {permutation}
          {timeRange}
          {colorOf}
          selected={isSelected(permutation)}
          onclick={() => onselect(permutation)}
        />
      {/each}

      {#if shown.length === 0}
        <p class="empty">
          {#if showingFavorites}
            No starred schedules yet.
          {:else if finished}
            Unable to find schedules...
          {:else}
            Looking for schedules...
          {/if}
        </p>
      {/if}
    </ScrollArea>
  </div>
</div>

<style>
  .strip {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .header {
    flex: 0 0 auto;
    padding: var(--space-2);
    text-align: center;
  }

  .list {
    flex: 1 1 auto;
    min-height: 0;
  }

  .empty {
    padding: var(--space-3);
    font-size: var(--font-size-small);
    color: var(--text-muted);
    text-align: center;
  }
</style>
