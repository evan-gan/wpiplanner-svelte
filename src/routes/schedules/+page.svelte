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
  import { colorForCourse } from '$lib/state/permutations.svelte';
  import { getAppState } from '$lib/state/app.svelte';

  const app = getAppState();

  let railWidth = $state(300);
  let thumbnailWidth = $state(170);
  let detailsSectionId = $state<string | null>(null);

  const colorOf = (courseId: string) => colorForCourse(courseId, app.selection.courseIds);

  const selected = $derived(app.permutations.selected);
  const isFavorite = $derived(selected !== null && app.favorites.contains(selected));

  const detailsCourseId = $derived(
    detailsSectionId === null ? null : (app.catalog.getCourseIdOfSection(detailsSectionId) ?? null),
  );
</script>

<div class="schedules">
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
            currentUrl={$page.url.href}
            ontoggleFavorite={() => selected !== null && app.favorites.toggle(selected)}
            onselectSection={(sectionId) => (detailsSectionId = sectionId)}
            onapplyProblems={(problems) => app.applyProblems(problems)}
          />
        {/snippet}
      </SplitPane>
    {/snippet}
  </SplitPane>
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
</style>
