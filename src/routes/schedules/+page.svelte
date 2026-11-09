<!--
  The Schedules tab: every conflict-free combination of the chosen sections.

  Layout follows `PermutationChooserView.ui.xml` — a course rail, a 170px strip
  of schedule sketches, and the schedule itself filling the rest. Unlike the old
  fixed 300px rail, the rail takes whatever width leaves the calendar square
  (`railWidthForSquareCalendar`), since its rows carry professor and times now.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/stores';
  import ScrollArea from '$lib/components/primitives/ScrollArea.svelte';
  import SplitPane from '$lib/components/primitives/SplitPane.svelte';
  import ScheduleThumbnailList from '$lib/components/schedules/ScheduleThumbnailList.svelte';
  import SchedulePane from '$lib/components/schedules/SchedulePane.svelte';
  import SectionDetailsDialog from '$lib/components/schedules/SectionDetailsDialog.svelte';
  import Popover from '$lib/components/primitives/Popover.svelte';
  import FixPanel from '$lib/components/schedules/FixPanel.svelte';
  import SectionPicker from '$lib/components/schedules/SectionPicker.svelte';
  import {
    describeFix,
    describeNoFix,
    describePanelHeader,
    type DescribeContext,
  } from '$lib/scheduling/fixDescription';
  import { clashingCourseIds } from '$lib/scheduling/scheduleClashes';
  import type { FixTrigger } from '$lib/state/fixPanel.svelte';
  import { HoverIntent } from '$lib/ui/hoverIntent';
  import type { Point } from '$lib/ui/placePopover';
  import WorkdayImport from '$lib/components/schedules/WorkdayImport.svelte';
  import { colorForCourse } from '$lib/state/permutations.svelte';
  import { getAppState } from '$lib/state/app.svelte';
  import { railWidthForSquareCalendar } from '$lib/ui/fitPaneSize';

  const app = getAppState();

  const MIN_RAIL_WIDTH = 300;
  const MAX_RAIL_WIDTH = 900;
  /** Matches `SplitPane`'s divider and `SchedulePane`'s toolbar. */
  const DIVIDER_SIZE = 5;
  const TOOLBAR_HEIGHT = 26;

  let railWidth = $state(MIN_RAIL_WIDTH);
  let thumbnailWidth = $state(170);
  let containerWidth = $state(0);
  let containerHeight = $state(0);

  /**
   * Re-fit the rail when the window changes size. Only the container size is
   * tracked, so dragging the divider sticks until the next window resize.
   */
  $effect(() => {
    if (containerWidth === 0 || containerHeight === 0) return;
    railWidth = railWidthForSquareCalendar({
      containerWidth,
      containerHeight,
      middleWidth: untrack(() => thumbnailWidth) + 2 * DIVIDER_SIZE,
      toolbarHeight: TOOLBAR_HEIGHT,
      minRailWidth: MIN_RAIL_WIDTH,
      maxRailWidth: MAX_RAIL_WIDTH,
    });
  });
  let detailsSectionId = $state<string | null>(null);

  const colorOf = (courseId: string) => colorForCourse(courseId, app.selection.courseIds);

  const selected = $derived(app.permutations.selected);

  /** A hovered fix replaces the schedule on the calendar until the pointer leaves it. */
  const shownSchedule = $derived(
    app.fixPanel.previewSectionIds === null
      ? selected
      : { sectionIds: app.fixPanel.previewSectionIds, problems: [] },
  );

  /** Each course's on-screen section, or its checked sections when nothing fits. */
  const fixBaselines = $derived(app.fixBaselines());

  function clashesOf(courseId: string, sectionIds: readonly string[]): string[] {
    const conflicts = app.permutations.conflicts;
    if (conflicts === null) return [];
    const others = new Map([...fixBaselines].filter(([otherId]) => otherId !== courseId));
    return clashingCourseIds(sectionIds, others, (sectionId, otherId) =>
      conflicts.hasConflict(sectionId, otherId),
    ).map((clashingId) => app.catalog.courseAbbrev(clashingId));
  }

  /** Where the fix popover opened: the cursor, when the link was hovered or clicked. */
  let fixAnchor = $state<Point>({ x: 0, y: 0 });
  // 300ms both ways: long enough to sweep past links without solving each, and
  // to move the pointer from the link into the popover without it closing.
  const fixHover = new HoverIntent({
    openDelayMs: 300,
    closeDelayMs: 300,
    onClose: () => app.fixPanel.close(),
  });

  function openFixes(trigger: FixTrigger, point: Point) {
    fixAnchor = point;
    app.openFixPanel(trigger);
  }

  function hoverFixes(trigger: FixTrigger, point: Point | null) {
    if (point === null) fixHover.leaveTrigger();
    else fixHover.enterTrigger(() => openFixes(trigger, point));
  }

  function closeFixes() {
    fixHover.reset();
    app.fixPanel.close();
  }

  /** Everything the fix panel's wording needs, measured against the schedule it opened on. */
  const fixContext: DescribeContext | null = $derived.by(() => {
    const target = app.fixPanel.target;
    if (target === null) return null;
    return {
      catalog: app.catalog,
      baselines: target.baselines,
      pinnedCourseId: target.courseId,
      pinnedComponent: target.componentNumber,
    };
  });
  const fixHeader = $derived(
    fixContext === null || app.fixPanel.target === null
      ? null
      : describePanelHeader(app.fixPanel.target.pickedSectionId, fixContext),
  );
  const fixCards = $derived(
    fixContext === null ? [] : (app.fixPanel.result?.fixes ?? []).map((fix) => describeFix(fix, fixContext)),
  );
  const noFixText = $derived(
    app.fixPanel.result?.reason == null
      ? null
      : describeNoFix(app.fixPanel.result.reason, app.catalog, app.fixPanel.searchedLonger),
  );
  const isFavorite = $derived(selected !== null && app.favorites.contains(selected));
  const favoriteName = $derived(
    selected === null ? '' : (app.favorites.nameOf(selected) ?? ''),
  );

  const detailsCourseId = $derived(
    detailsSectionId === null ? null : (app.catalog.getCourseIdOfSection(detailsSectionId) ?? null),
  );
</script>

<div class="schedules" bind:clientWidth={containerWidth} bind:clientHeight={containerHeight}>
  {#if !app.hasCourses}
    <!--
      Nothing to schedule yet, so the rails and the empty grid would only be
      furniture. The import is the one thing that works from here.
    -->
    <div class="empty">
      <p class="empty-lead">
        No courses chosen yet — pick them on the <a href="/courses/">Courses</a> tab, or import the
        ones you are already registered for:
      </p>
      <WorkdayImport
        catalog={app.catalog}
        onimport={(sections) => app.importEnrolledSections(sections)}
      />
    </div>
  {:else}
  <SplitPane side="west" bind:size={railWidth} minSize={180} maxSize={MAX_RAIL_WIDTH}>
    {#snippet fixed()}
      <ScrollArea bind:scrollTop={app.railView.scrollTop}>
        <SectionPicker
          catalog={app.catalog}
          courseIds={app.selection.courseIds}
          isSectionDenied={(courseId, sectionId) =>
            app.selection.isSectionDenied(courseId, sectionId)}
          isTermDenied={(courseId, term) => app.selection.isTermDenied(courseId, term)}
          scheduledSectionIds={selected?.sectionIds ?? []}
          {colorOf}
          isExpanded={(courseId) => app.railView.isExpanded(courseId)}
          ontoggleExpanded={(courseId) => app.railView.toggleExpanded(courseId)}
          onsetSectionsDenied={(courseId, sectionIds, denied) =>
            app.setSectionsDenied(courseId, sectionIds, denied)}
          ontoggleTerm={(courseId, term) =>
            app.setTermDenied(courseId, term, !app.selection.isTermDenied(courseId, term))}
          onhighlight={(sectionId) => (app.permutations.highlightedSectionId = sectionId)}
          onshowDetails={(sectionId) => (detailsSectionId = sectionId)}
          {clashesOf}
          onfixesHover={hoverFixes}
          onfixesOpen={(trigger, point) => fixHover.openNow(() => openFixes(trigger, point))}
        />
      </ScrollArea>
    {/snippet}

    {#snippet flexible()}
      <SplitPane side="west" bind:size={thumbnailWidth} minSize={120} maxSize={320}>
        {#snippet fixed()}
          <ScheduleThumbnailList
            catalog={app.catalog}
            permutations={app.permutations.permutations}
            favorites={app.favorites.asPermutations()}
            favoriteNameOf={(permutation) => app.favorites.nameOf(permutation) ?? ''}
            onrenameFavorite={(permutation, name) => app.favorites.rename(permutation, name)}
            timeRange={app.timeRange}
            {colorOf}
            isSelected={(permutation) => app.permutations.isSelected(permutation)}
            onselect={(permutation) => app.selectSchedule(permutation)}
            finished={app.permutations.status === 'done'}
          />
        {/snippet}

        {#snippet flexible()}
          <SchedulePane
            catalog={app.catalog}
            selected={shownSchedule}
            status={app.permutations.status}
            errorMessage={app.permutations.errorMessage}
            scheduleCount={app.permutations.count}
            courses={app.selection.generatorCourses()}
            chosenTimes={app.chosenTimes.snapshot()}
            timeRange={app.timeRange}
            highlightedSectionId={app.permutations.highlightedSectionId}
            {colorOf}
            {isFavorite}
            {favoriteName}
            currentUrl={$page.url.href}
            ontoggleFavorite={() => selected !== null && app.favorites.toggle(selected)}
            onrenameFavorite={(name) => selected !== null && app.favorites.rename(selected, name)}
            onselectSection={(sectionId) => (detailsSectionId = sectionId)}
            onapplyProblems={(problems) => app.applyProblems(problems)}
            onimportWorkday={(sections) => app.importEnrolledSections(sections)}
          />
        {/snippet}
      </SplitPane>
    {/snippet}
  </SplitPane>
  {/if}
</div>

{#if fixHeader !== null}
  <Popover
    anchor={fixAnchor}
    label="Ways to fit {fixHeader.title}"
    onclose={closeFixes}
    onpointerenter={() => fixHover.enterSurface()}
    onpointerleave={() => fixHover.leaveSurface()}
  >
    <FixPanel
      header={fixHeader}
      status={app.fixPanel.status}
      errorMessage={app.fixPanel.errorMessage}
      cards={fixCards}
      {noFixText}
      complete={app.fixPanel.result?.complete ?? true}
      canSearchLonger={app.fixPanel.result?.reason?.kind === 'timed-out' && !app.fixPanel.searchedLonger}
      searchingLonger={app.fixPanel.searchedLonger}
      onsearchLonger={() => app.fixPanel.searchLonger()}
      onclose={closeFixes}
      onpreview={(sectionIds) => (app.fixPanel.previewSectionIds = sectionIds)}
      onapply={(sectionIds) => app.applyFix(sectionIds)}
    />
  </Popover>
{/if}

<SectionDetailsDialog
  catalog={app.catalog}
  sectionId={detailsSectionId}
  conflictingSectionIds={detailsSectionId === null
    ? []
    : (app.permutations.conflicts?.getConflicts(detailsSectionId) ?? [])}
  denied={detailsSectionId !== null &&
    detailsCourseId !== null &&
    app.selection.isSectionDenied(detailsCourseId, detailsSectionId)}
  ontoggle={() => {
    if (detailsSectionId !== null && detailsCourseId !== null) {
      app.toggleSection(detailsCourseId, detailsSectionId);
    }
  }}
  onclose={() => (detailsSectionId = null)}
/>

<style>
  .schedules {
    position: absolute;
    inset: 0;
  }

  .empty {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* The import panel scrolls itself, so it takes the space the lead leaves. */
  .empty > :global(.panel) {
    flex: 1 1 auto;
    min-height: 0;
    height: auto;
  }

  .empty-lead {
    margin: 0;
    padding: var(--space-4) var(--space-5) 0;
    max-width: 46em;
  }
</style>
