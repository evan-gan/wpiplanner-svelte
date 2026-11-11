<!--
  The left rail: one collapsible group per chosen course, listing its lectures
  with each lecture's labs and discussions nested beneath it.

  Ported from `StudentCourseList` + `CourseItem` + `SectionCheckbox` +
  `PeriodSelectList`, which listed every lecture+lab combination as its own
  checkbox; the split into lectures and labs is `CourseComponentList`. Hovering
  a row previews it on the grid, clicking its professor opens the section
  details — both behaviours of the old rail.

  The rail is one CSS grid, and every row below it is a subgrid of it, so the
  section, professor, and time columns line up across all courses.

  Courses are grouped under a term divider by where the schedule on screen
  puts them, with the ones it leaves out under a muted "Not on schedule"
  divider at the bottom. A new schedule can move courses between groups; the
  course the student last touched (or failing that, an open one) is held
  still on screen and everything else slides around it.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Catalog } from '$lib/model/catalog';
  import { groupCoursesByScheduledTerm } from '$lib/model/scheduleTermGroups';
  import type { TermName } from '$lib/model/schedb';
  import TermBadges from '$lib/components/catalog/TermBadges.svelte';
  import type { FixTrigger } from '$lib/state/fixPanel.svelte';
  import type { Point } from '$lib/ui/placePopover';
  import {
    cancelSlides,
    chooseAnchor,
    findScrollParent,
    keepAnchorInPlace,
    slideFromSnapshot,
    snapshotTops,
  } from '$lib/ui/stableReorder';
  import CourseComponentList from './CourseComponentList.svelte';
  import TermDivider from './TermDivider.svelte';

  interface Props {
    catalog: Catalog;
    courseIds: string[];
    isSectionDenied: (courseId: string, sectionId: string) => boolean;
    isTermDenied: (courseId: string, term: TermName) => boolean;
    /** Sections of the schedule on screen, highlighted in their course colour. */
    scheduledSectionIds: string[];
    /**
     * Sections that decide which term divider each course sits under. Normally
     * the same as `scheduledSectionIds`, but held over while a search restarts
     * so the rail does not flash every course to "Not on schedule".
     */
    placementSectionIds: string[];
    colorOf: (courseId: string) => string;
    /** Open/closed is owned by the caller so it survives the tab unmounting. */
    isExpanded: (courseId: string) => boolean;
    ontoggleExpanded: (courseId: string) => void;
    /** Switches a group of sections on or off in one go. */
    onsetSectionsDenied: (courseId: string, sectionIds: string[], denied: boolean) => void;
    ontoggleTerm: (courseId: string, term: TermName) => void;
    onhighlight: (sectionId: string | null) => void;
    onshowDetails: (sectionId: string) => void;
    /** Course codes a row's sections clash with on the schedule on screen; empty if it fits. */
    clashesOf: (courseId: string, sectionIds: readonly string[]) => string[];
    /** A mouse rested on (a point) or left (null) a row's "Clashes" link. */
    onfixesHover: (trigger: FixTrigger, point: Point | null) => void;
    /** A row's "Clashes" link was clicked or tapped. */
    onfixesClick: (trigger: FixTrigger, point: Point) => void;
  }

  let {
    catalog,
    courseIds,
    isSectionDenied,
    isTermDenied,
    scheduledSectionIds,
    placementSectionIds,
    colorOf,
    isExpanded,
    ontoggleExpanded,
    onsetSectionsDenied,
    ontoggleTerm,
    onhighlight,
    onshowDetails,
    clashesOf,
    onfixesHover,
    onfixesClick,
  }: Props = $props();

  type RailItem =
    | { kind: 'divider'; key: string; label: string; muted: boolean }
    | { kind: 'course'; key: string; courseId: string };

  /*
    One flat keyed list rather than an #each per group, so a course moving to
    another group keeps its DOM node — a rebuilt node would lose the pointer's
    hover (and its mouseleave) mid-move.
  */
  const railItems = $derived<RailItem[]>(
    groupCoursesByScheduledTerm(catalog, courseIds, placementSectionIds).flatMap((group) => [
      { kind: 'divider', key: `divider:${group.key}`, label: group.label, muted: !group.onSchedule },
      ...group.courseIds.map((courseId): RailItem => ({ kind: 'course', key: courseId, courseId })),
    ]),
  );

  // A string, so the effect below reruns only when the order really changes.
  const railOrder = $derived(railItems.map((item) => item.key).join('\n'));

  let railElement: HTMLElement | undefined = $state();
  /** Blank space under the list so a short rail can still scroll to hold its anchor. */
  let slackElement: HTMLElement | undefined = $state();
  /** Plain, not reactive: only read at the moment of a reorder. */
  let lastTouchedCourseId: string | null = null;

  /** Every divider and course currently in the rail, keyed, in DOM order. */
  function railItemElements(): Map<string, HTMLElement> {
    const elements = new Map<string, HTMLElement>();
    for (const element of railElement?.querySelectorAll<HTMLElement>(':scope > [data-rail-key]') ?? []) {
      elements.set(element.dataset.railKey ?? '', element);
    }
    return elements;
  }

  /** Measure before the DOM reorders, then put the anchor back and slide the rest. */
  function holdAnchorThroughReorder() {
    if (railElement === undefined) return; // first run, nothing drawn yet
    const scroller = findScrollParent(railElement);
    const before = railItemElements();
    if (scroller === null || before.size === 0) return;

    // Measured while earlier slides are still running, so a slide picks up from where it is drawn.
    const tops = snapshotTops(before);
    cancelSlides(before);
    const preferred = [lastTouchedCourseId, ...courseIds.filter(isExpanded)].filter(
      (key): key is string => key !== null,
    );
    const anchorKey = chooseAnchor(scroller.getBoundingClientRect(), before, preferred);

    tick().then(() => {
      const after = railItemElements();
      if (anchorKey !== undefined && slackElement !== undefined) {
        keepAnchorInPlace(scroller, anchorKey, tops, after, slackElement);
      }
      slideFromSnapshot(tops, after);
    });
  }

  /** Remember which course a press or focus landed in; that one is held still next reorder. */
  function rememberTouchedCourse(event: Event) {
    const course = (event.target as Element | null)?.closest<HTMLElement>('section.course[data-rail-key]');
    if (course?.dataset.railKey !== undefined) lastTouchedCourseId = course.dataset.railKey;
  }

  // Listening on the rail, not on each course, keeps the courses free of handlers.
  $effect(() => {
    const rail = railElement;
    if (rail === undefined) return;
    rail.addEventListener('pointerdown', rememberTouchedCourse, true);
    rail.addEventListener('focusin', rememberTouchedCourse);
    return () => {
      rail.removeEventListener('pointerdown', rememberTouchedCourse, true);
      rail.removeEventListener('focusin', rememberTouchedCourse);
    };
  });

  // `.pre` runs before the DOM update, which is the only time the old positions can be read.
  $effect.pre(() => {
    void railOrder;
    untrack(holdAnchorThroughReorder);
  });
</script>

{#snippet courseBlock(courseId: string, firstInGroup: boolean)}
  {@const course = catalog.requireCourse(courseId)}
  <section class="course" class:first-in-group={firstInGroup} data-rail-key={courseId}>
    <div class="course-header">
      <button
        type="button"
        class="collapse"
        aria-expanded={isExpanded(courseId)}
        onclick={() => ontoggleExpanded(courseId)}
      >
        {isExpanded(courseId) ? '▼' : '▶'}
      </button>
      <span class="abbrev">{catalog.courseAbbrev(courseId)}</span>
      <TermBadges
        {course}
        interactive
        isTermDenied={(term) => isTermDenied(courseId, term)}
        ontoggle={(term) => ontoggleTerm(courseId, term)}
      />
    </div>

    {#if isExpanded(courseId)}
      <CourseComponentList
        {course}
        isSectionDenied={(sectionId) => isSectionDenied(courseId, sectionId)}
        {scheduledSectionIds}
        color={colorOf(courseId)}
        onsetSectionsDenied={(sectionIds, denied) => onsetSectionsDenied(courseId, sectionIds, denied)}
        {onhighlight}
        {onshowDetails}
        clashesOf={(sectionIds) => clashesOf(courseId, sectionIds)}
        onfixesHover={(trigger, point) => onfixesHover({ courseId, ...trigger }, point)}
        onfixesClick={(trigger, point) => onfixesClick({ courseId, ...trigger }, point)}
      />
    {/if}
  </section>
{/snippet}

<div class="rail" bind:this={railElement}>
  {#each railItems as item, index (item.key)}
    {#if item.kind === 'divider'}
      <TermDivider label={item.label} muted={item.muted} itemKey={item.key} />
    {:else}
      {@render courseBlock(item.courseId, railItems[index - 1]?.kind === 'divider')}
    {/if}
  {/each}

  {#if courseIds.length === 0}
    <p class="empty">Add a course on the Courses tab to see schedules.</p>
  {/if}

  <!-- Height set directly by `keepAnchorInPlace`, outside Svelte, mid-reorder. -->
  <div class="reorder-slack" aria-hidden="true" bind:this={slackElement}></div>
</div>

<style>
  /*
    Columns: checkbox + section label (capped so "Interest List-A Term" cannot
    take over), professor (takes the slack, truncates), the "Clashes" link
    (empty, so zero-width, while everything fits), and meeting times last so
    they line up along the right edge whether or not a row clashes.
  */
  .rail {
    display: grid;
    grid-template-columns: fit-content(9em) minmax(0, 1fr) max-content max-content;
    column-gap: var(--space-3);
    padding: var(--space-1);
  }

  .course {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    border-bottom: 1px solid var(--text);
  }

  /* Every course has only a bottom rule, so the first one under a divider needs its own top rule. */
  .course.first-in-group {
    border-top: 1px solid var(--text);
  }

  .course-header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1);
  }

  .abbrev {
    flex: 1 1 auto;
    text-align: center;
    font-weight: bold;
  }

  .collapse {
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    line-height: 1;
    padding: 2px 5px;
  }

  .reorder-slack {
    grid-column: 1 / -1;
  }

  .empty {
    grid-column: 1 / -1;
    padding: var(--space-3);
    color: var(--text-muted);
    font-size: var(--font-size-small);
  }
</style>
