<!--
  The main pane of the Schedules tab: a toolbar and whichever view the current
  state calls for.

  Ported from `PermutationScheduleView`. The view mode is derived rather than
  stored: with no schedules the pane shows progress while the search runs and the
  conflict resolver once it has finished empty-handed, which is exactly what the
  legacy `update()` computed — only there it was a mutable field that had to be
  diffed against the last one.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import type { ChosenTimes, CourseSectionLists, Problem, SchedulePermutation } from '$lib/scheduling/types';
  import ToggleButton from '$lib/components/primitives/ToggleButton.svelte';
  import type { GenerationStatus } from '$lib/state/permutations.svelte';
  import type { TimeRangeState } from '$lib/state/timeRange.svelte';
  import CalendarExport from './CalendarExport.svelte';
  import ConflictResolver from './ConflictResolver.svelte';
  import DetailedView from './DetailedView.svelte';
  import GenerationProgress from './GenerationProgress.svelte';
  import QuarterGrid from './QuarterGrid.svelte';
  import ShareLink from './ShareLink.svelte';
  import WorkdayImport from './WorkdayImport.svelte';
  import type { MatchedCourse } from '$lib/workday';

  interface Props {
    catalog: Catalog;
    selected: SchedulePermutation | null;
    status: GenerationStatus;
    errorMessage: string | null;
    scheduleCount: number;
    courses: CourseSectionLists;
    chosenTimes: ChosenTimes;
    timeRange: TimeRangeState;
    highlightedSectionId: string | null;
    colorOf: (courseId: string) => string;
    isFavorite: boolean;
    currentUrl: string;
    ontoggleFavorite: () => void;
    onselectSection: (sectionId: string) => void;
    onapplyProblems: (problems: readonly Problem[]) => void;
    /** Applies a confirmed Workday import; returns how many courses were kept. */
    onimportWorkday: (sections: readonly MatchedCourse[]) => number;
  }

  let {
    catalog,
    selected,
    status,
    errorMessage,
    scheduleCount,
    courses,
    chosenTimes,
    timeRange,
    highlightedSectionId,
    colorOf,
    isFavorite,
    currentUrl,
    ontoggleFavorite,
    onselectSection,
    onapplyProblems,
    onimportWorkday,
  }: Props = $props();

  type ViewMode = 'grid' | 'detail' | 'export';

  let preferredView = $state<ViewMode>('grid');
  let sharing = $state(false);

  /** What is actually on screen, which is not always what the buttons request. */
  const shown = $derived.by(() => {
    if (status === 'error') return 'error' as const;
    if (scheduleCount === 0) return status === 'searching' ? ('progress' as const) : ('conflict' as const);
    return preferredView;
  });

  const showsSchedule = $derived(shown === 'grid' || shown === 'detail' || shown === 'export');
  const sectionIds = $derived(selected?.sectionIds ?? []);
</script>

<div class="pane">
  <div class="toolbar">
    <ToggleButton pressed={preferredView === 'grid'} onclick={() => (preferredView = 'grid')}>
      Grid
    </ToggleButton>
    <ToggleButton pressed={preferredView === 'detail'} onclick={() => (preferredView = 'detail')}>
      Detail
    </ToggleButton>
    <ToggleButton pressed={preferredView === 'export'} onclick={() => (preferredView = 'export')}>
      Export to Calendar
    </ToggleButton>
    <WorkdayImport {catalog} onimport={onimportWorkday} />

    <span class="spacer"></span>

    {#if showsSchedule}
      <ToggleButton
        pressed={isFavorite}
        onclick={ontoggleFavorite}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {isFavorite ? '★' : '☆'}
      </ToggleButton>
      <ToggleButton pressed={sharing} onclick={() => (sharing = !sharing)}>Share</ToggleButton>
    {/if}
  </div>

  {#if sharing && showsSchedule}
    <div class="share-popup">
      <ShareLink {sectionIds} {currentUrl} />
    </div>
  {/if}

  <div class="body">
    {#if shown === 'error'}
      <p class="error" role="alert">
        The schedule generator could not run: {errorMessage}
      </p>
    {:else if shown === 'progress'}
      <GenerationProgress {catalog} {courses} />
    {:else if shown === 'conflict'}
      <ConflictResolver {catalog} {courses} {chosenTimes} onapply={onapplyProblems} />
    {:else if shown === 'detail'}
      <DetailedView {catalog} {sectionIds} />
    {:else if shown === 'export'}
      <CalendarExport {catalog} {sectionIds} />
    {:else}
      <QuarterGrid
        {catalog}
        {sectionIds}
        {highlightedSectionId}
        {timeRange}
        {colorOf}
        onselect={onselectSection}
      />
    {/if}
  </div>
</div>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
  }

  .toolbar {
    flex: 0 0 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-2);
  }

  .spacer {
    flex: 1 1 auto;
  }

  .share-popup {
    position: absolute;
    top: 28px;
    right: var(--space-2);
    z-index: 5;
    background: var(--surface);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-md);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
  }

  .body {
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
  }

  .error {
    padding: var(--space-5);
    color: var(--warn-full);
  }
</style>
