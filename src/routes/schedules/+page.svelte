<!--
  The Schedules tab: every conflict-free combination of the chosen sections.

  Layout follows `PermutationChooserView.ui.xml` — a 300px course rail, a 170px
  strip of schedule sketches, and the schedule itself filling the rest.
-->
<script lang="ts">
  import { page } from '$app/stores';
  import ScrollArea from '$lib/components/primitives/ScrollArea.svelte';
  import SplitPane from '$lib/components/primitives/SplitPane.svelte';
  import ScheduleThumbnailList from '$lib/components/schedules/ScheduleThumbnailList.svelte';
  import SchedulePane from '$lib/components/schedules/SchedulePane.svelte';
  import SectionDetailsDialog from '$lib/components/schedules/SectionDetailsDialog.svelte';
  import SectionPicker from '$lib/components/schedules/SectionPicker.svelte';
  import WorkdayImport from '$lib/components/schedules/WorkdayImport.svelte';
  import { colorForCourse } from '$lib/state/permutations.svelte';
  import { getAppState } from '$lib/state/app.svelte';

  const app = getAppState();

  let railWidth = $state(300);
  let thumbnailWidth = $state(170);
  let detailsSectionId = $state<string | null>(null);

  const colorOf = (courseId: string) => colorForCourse(courseId, app.selection.courseIds);

  const selected = $derived(app.permutations.selected);
  const isFavorite = $derived(selected !== null && app.favorites.contains(selected));
  const favoriteName = $derived(
    selected === null ? '' : (app.favorites.nameOf(selected) ?? ''),
  );

  const detailsCourseId = $derived(
    detailsSectionId === null ? null : (app.catalog.getCourseIdOfSection(detailsSectionId) ?? null),
  );
</script>

<div class="schedules">
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
  <SplitPane side="west" bind:size={railWidth} minSize={180} maxSize={520}>
    {#snippet fixed()}
      <ScrollArea>
        <SectionPicker
          catalog={app.catalog}
          courseIds={app.selection.courseIds}
          isSectionDenied={(courseId, sectionId) =>
            app.selection.isSectionDenied(courseId, sectionId)}
          isTermDenied={(courseId, term) => app.selection.isTermDenied(courseId, term)}
          scheduledSectionIds={selected?.sectionIds ?? []}
          {colorOf}
          ontoggleSection={(courseId, sectionId) => app.toggleSection(courseId, sectionId)}
          onsetSectionsDenied={(courseId, sectionIds, denied) =>
            app.setSectionsDenied(courseId, sectionIds, denied)}
          ontoggleTerm={(courseId, term) =>
            app.setTermDenied(courseId, term, !app.selection.isTermDenied(courseId, term))}
          onhighlight={(sectionId) => (app.permutations.highlightedSectionId = sectionId)}
          onshowDetails={(sectionId) => (detailsSectionId = sectionId)}
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
            onselect={(permutation) => app.permutations.select(permutation)}
            finished={app.permutations.status === 'done'}
          />
        {/snippet}

        {#snippet flexible()}
          <SchedulePane
            catalog={app.catalog}
            {selected}
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
