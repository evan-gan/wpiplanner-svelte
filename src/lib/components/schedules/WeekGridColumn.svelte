<!--
  One day column of a week grid.

  Ported from `WeekCourseColumn`. Blocks are positioned as a percentage of the
  column rather than in pixels recomputed on every resize, so the layout follows
  the container without a resize handler.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import { maskHasDay } from '$lib/model/days';
  import type { PeriodJson, TermName } from '$lib/model/schedb';
  import type { TimeRangeState } from '$lib/state/timeRange.svelte';
  import PeriodBlock from './PeriodBlock.svelte';

  interface Props {
    catalog: Catalog;
    /** Sunday-based day index this column shows. */
    dayIndex: number;
    /** Only sections taught in one of these terms are drawn. */
    terms: TermName[];
    sectionIds: string[];
    /**
     * Drawn on top and undimmed; the section the student is hovering. A section
     * that is not part of the schedule on screen is previewed here, so hovering
     * shows where it would land if it were picked.
     */
    highlightedSectionId: string | null;
    timeRange: TimeRangeState;
    colorOf: (courseId: string) => string;
    /** Alternating columns get a tinted background, as the old grid did. */
    tinted: boolean;
    onselect: (sectionId: string) => void;
  }

  let {
    catalog,
    dayIndex,
    terms,
    sectionIds,
    highlightedSectionId,
    timeRange,
    colorOf,
    tinted,
    onselect,
  }: Props = $props();

  interface Placed {
    key: string;
    sectionId: string;
    courseId: string;
    period: PeriodJson;
    title: string;
  }

  /** The schedule's sections, plus the hovered one when it is not among them. */
  const drawnSectionIds = $derived(
    highlightedSectionId !== null && !sectionIds.includes(highlightedSectionId)
      ? [...sectionIds, highlightedSectionId]
      : sectionIds,
  );

  const placed = $derived.by(() => {
    const blocks: Placed[] = [];

    for (const sectionId of drawnSectionIds) {
      const section = catalog.getSection(sectionId);
      const courseId = catalog.getCourseIdOfSection(sectionId);
      if (section === undefined || courseId === undefined) continue;
      if (!section.terms.some((term) => terms.includes(term))) continue;

      const department = catalog.getDepartmentOfCourse(courseId);
      const course = catalog.getCourse(courseId);
      const title = `${department?.abbrev ?? ''} ${course?.number ?? ''}`.trim();

      for (const [index, period] of section.periods.entries()) {
        if (!maskHasDay(period.days, dayIndex)) continue;
        blocks.push({ key: `${sectionId}#${index}`, sectionId, courseId, period, title });
      }
    }

    return blocks;
  });
</script>

<div class="column" class:tinted>
  {#each placed as block (block.key)}
    {@const top = timeRange.progress(block.period.startMinutes)}
    <PeriodBlock
      period={block.period}
      title={block.title}
      color={colorOf(block.courseId)}
      {top}
      height={timeRange.progress(block.period.endMinutes) - top}
      dimmed={highlightedSectionId !== null && highlightedSectionId !== block.sectionId}
      onclick={() => onselect(block.sectionId)}
    />
  {/each}
</div>

<style>
  .column {
    position: relative;
    height: 100%;
    min-width: 0;
  }

  .column.tinted {
    background: var(--surface-alt);
  }
</style>
