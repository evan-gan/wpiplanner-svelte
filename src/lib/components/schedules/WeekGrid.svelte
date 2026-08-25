<!--
  One week: an hour axis down the left, then Monday to Friday.

  Ported from `WeekCourseView`, including the oversized translucent term letters
  behind the grid. The legacy version rebuilt every marker on each resize from a
  100ms timer; the markers are laid out in percentages here, so a resize is free.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import { WEEKDAY_INDEXES, fullDayName } from '$lib/model/days';
  import type { TermName } from '$lib/model/schedb';
  import { formatClockTime } from '$lib/model/time';
  import type { TimeRangeState } from '$lib/state/timeRange.svelte';
  import WeekGridColumn from './WeekGridColumn.svelte';

  interface Props {
    catalog: Catalog;
    terms: TermName[];
    sectionIds: string[];
    highlightedSectionId: string | null;
    timeRange: TimeRangeState;
    colorOf: (courseId: string) => string;
    onselect: (sectionId: string) => void;
  }

  let {
    catalog,
    terms,
    sectionIds,
    highlightedSectionId,
    timeRange,
    colorOf,
    onselect,
  }: Props = $props();

  /** One marker per whole hour in the visible window. */
  const hours = $derived(
    Array.from({ length: Math.max(0, timeRange.endHour - timeRange.startHour) }, (_, index) =>
      timeRange.startHour + index,
    ),
  );

  const watermark = $derived(terms.join(''));

  /** Half an hour as a fraction of the visible window — the marker's height. */
  const halfHourHeight = $derived(timeRange.hours > 0 ? 0.5 / timeRange.hours : 0);

  /** One hour as a fraction of the visible window — the axis cell's height. */
  const hourHeight = $derived(halfHourHeight * 2);
</script>

<div class="week">
  <div class="weekdays">
    <div class="axis-spacer"></div>
    {#each WEEKDAY_INDEXES as dayIndex (dayIndex)}
      <div class="weekday">{fullDayName(dayIndex)}</div>
    {/each}
  </div>

  <div class="body">
    <div class="axis">
      {#each hours as hour (hour)}
        <div
          class="hour-label"
          style:top="{timeRange.progress(hour * 60) * 100}%"
          style:height="{hourHeight * 100}%"
        >
          {formatClockTime(hour * 60, false)}
        </div>
      {/each}
    </div>

    <div class="columns">
      {#each WEEKDAY_INDEXES as dayIndex, index (dayIndex)}
        <WeekGridColumn
          {catalog}
          {dayIndex}
          {terms}
          {sectionIds}
          {highlightedSectionId}
          {timeRange}
          {colorOf}
          tinted={index % 2 === 0}
          {onselect}
        />
      {/each}

      <!--
        Both overlays come after the columns so they paint over the tinted ones.
        The period blocks carry a higher z-index and stay on top of both.
      -->
      <span class="watermark" aria-hidden="true">{watermark}</span>

      {#each hours as hour (hour)}
        <div
          class="hour-marker"
          style:top="{timeRange.progress(hour * 60) * 100}%"
          style:height="{halfHourHeight * 100}%"
        ></div>
      {/each}
    </div>
  </div>
</div>

<style>
  .week {
    --axis-width: 38px;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    min-height: 0;
  }

  .weekdays,
  .columns {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
  }

  .weekdays {
    grid-template-columns: var(--axis-width) repeat(5, 1fr);
    flex: 0 0 12px;
  }

  .weekday {
    font-size: 9px;
    text-align: center;
    overflow: hidden;
    white-space: nowrap;
  }

  .body {
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: var(--axis-width) 1fr;
    min-height: 0;
  }

  .axis {
    position: relative;
    overflow: hidden;
  }

  .hour-label {
    position: absolute;
    left: 0;
    width: var(--axis-width);
    border: 1px solid var(--border-subtle);
    font-size: smaller;
    overflow: hidden;
    line-height: 1.1;
  }

  /*
    The oversized term letters behind the grid. The old app hardcoded 325px,
    which only looked right at one window size; sizing against the container
    keeps the same effect in both the single-week and the 2x2 views.
  */
  .watermark {
    position: absolute;
    bottom: 0;
    right: 8%;
    font-size: 50cqh;
    line-height: 0.95;
    opacity: 0.14;
    pointer-events: none;
    user-select: none;
    z-index: 1;
  }

  .columns {
    position: relative;
    min-height: 0;
    container-type: size;
    overflow: hidden;
  }

  /*
    One marker per hour, half an hour tall: `permutationHourMarker` drew the
    hour as a solid rule and the half hour as a dotted one by bordering a
    half-height block, and the dotted line is the only half-hour cue the grid
    has.
  */
  .hour-marker {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--border-subtle);
    border-bottom: 1px dotted var(--border-subtle);
    pointer-events: none;
    z-index: 1;
  }
</style>
