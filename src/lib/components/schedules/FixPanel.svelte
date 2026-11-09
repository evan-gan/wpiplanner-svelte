<!--
  "How could I take this?" — the contents of the popover that opens at the
  cursor over a rail row's "Clashes" link (the page wraps it in `Popover`).

  The top says what was picked, how it differs from what is on screen, and
  what it clashes with. Below, one card per way to make it fit: the best of
  each tier first (same profs & terms → new prof → term move → both), the rest
  behind "More options". All wording comes from `fixDescription.ts`.
-->
<script lang="ts">
  import {
    splitBestPerTier,
    type FixCardModel,
    type PanelHeaderModel,
  } from '$lib/scheduling/fixDescription';
  import type { FixSearchStatus } from '$lib/state/fixPanel.svelte';
  import FixCard from './FixCard.svelte';

  interface Props {
    header: PanelHeaderModel;
    status: FixSearchStatus;
    errorMessage: string | null;
    cards: FixCardModel[];
    /** Set when the search found nothing, in plain words. */
    noFixText: string | null;
    /** False when the search hit its time limit, so better fixes may exist. */
    complete: boolean;
    /** The quick search ran out of time with nothing found; offer the long one. */
    canSearchLonger: boolean;
    /** The long search is the one running. */
    searchingLonger: boolean;
    onsearchLonger: () => void;
    onclose: () => void;
    onpreview: (sectionIds: string[] | null) => void;
    onapply: (sectionIds: string[]) => void;
  }

  let {
    header,
    status,
    errorMessage,
    cards,
    noFixText,
    complete,
    canSearchLonger,
    searchingLonger,
    onsearchLonger,
    onclose,
    onpreview,
    onapply,
  }: Props = $props();

  let showMore = $state(false);
  const split = $derived(splitBestPerTier(cards));
  const visibleCards = $derived(showMore ? [...split.best, ...split.more] : split.best);
</script>

<section class="panel" aria-label="Ways to fit {header.title}">
  <header>
    <div class="title-row">
      <h2>{header.title} · <span class="meeting">{header.meeting}</span></h2>
      <button type="button" class="close" title="Close" aria-label="Close" onclick={onclose}>✕</button>
    </div>
    {#if header.tags.length > 0}
      <div class="tags">
        {#each header.tags as tag (tag)}
          <span class="tag">({tag})</span>
        {/each}
      </div>
    {/if}
    {#if header.clashes.length > 0}
      <p class="clashes">Clashes with {header.clashes.join('; ')}</p>
    {/if}
  </header>

  <div class="body">
    {#if status === 'searching' && searchingLonger}
      <p class="status">Searching longer (up to 30 seconds)… Close this box to stop.</p>
    {:else if status === 'searching'}
      <p class="status">Looking for ways to fit this…</p>
    {:else if status === 'error'}
      <p class="status error">The fix search failed: {errorMessage}. Close this and try again.</p>
    {:else if noFixText !== null}
      <p class="status">{noFixText}</p>
      {#if canSearchLonger}
        <div class="search-longer">
          <button type="button" onclick={onsearchLonger}>Search longer</button>
          <span class="status">There will likely be no results.</span>
        </div>
      {/if}
    {:else}
      {#each visibleCards as card (card.sectionIds.join())}
        <FixCard
          {card}
          onpreview={(on) => onpreview(on ? card.sectionIds : null)}
          onapply={() => onapply(card.sectionIds)}
        />
      {/each}
      {#if split.more.length > 0}
        <button type="button" class="more" onclick={() => (showMore = !showMore)}>
          {showMore ? 'Fewer options' : `More options (${split.more.length})`}
        </button>
      {/if}
      {#if !complete}
        <p class="status">Showing the best found so far.</p>
      {/if}
    {/if}
  </div>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  header {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-subtle);
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }

  h2 {
    flex: 1 1 auto;
    margin: 0;
    font-size: inherit;
  }

  .meeting {
    font-weight: normal;
    font-variant-numeric: tabular-nums;
  }

  .close {
    border: 0;
    background: none;
    cursor: pointer;
    font-size: inherit;
    line-height: 1;
    padding: 2px;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .tag {
    white-space: nowrap;
  }

  .clashes {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-small);
  }

  .body {
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .status {
    margin: 0;
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  .status.error {
    color: var(--warn-full);
  }

  .search-longer {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .search-longer button {
    padding: 2px 8px;
    border: 1px solid var(--border-panel);
    border-radius: var(--radius-sm);
    background: var(--surface-alt);
    font: inherit;
    font-size: var(--font-size-small);
    cursor: pointer;
  }

  .more {
    align-self: flex-start;
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: var(--font-size-small);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
