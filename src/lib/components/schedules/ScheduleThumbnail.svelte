<!--
  A 150x150 canvas sketch of one schedule.

  Ported from `PermutationCanvasList.addPermutation` rather than rewritten: the
  hour lines (lighter, with noon picked out), the vertical weekday dividers, and
  the quarter-width bars offset by term index are all drawn the same way. Canvas
  is right here — a hundred of these as DOM would be a hundred hundred-node
  subtrees.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import { WEEKDAY_INDEXES, maskHasDay } from '$lib/model/days';
  import { minutesToDecimalHours } from '$lib/model/time';
  import { termIndex } from '$lib/model/terms';
  import type { SchedulePermutation } from '$lib/scheduling/types';
  import type { TimeRangeState } from '$lib/state/timeRange.svelte';

  interface Props {
    catalog: Catalog;
    permutation: SchedulePermutation;
    timeRange: TimeRangeState;
    colorOf: (courseId: string) => string;
    selected: boolean;
    onclick: () => void;
  }

  let { catalog, permutation, timeRange, colorOf, selected, onclick }: Props = $props();

  const SIZE = 150;

  let canvas: HTMLCanvasElement | undefined = $state();

  function drawBackground(context: CanvasRenderingContext2D) {
    const heightPerHour = SIZE / timeRange.hours;
    context.lineWidth = 1;

    for (let hour = timeRange.startHour; hour <= timeRange.endHour; hour++) {
      // Half-pixel offset keeps a 1px line crisp.
      const y = Math.floor((hour - timeRange.startHour) * heightPerHour) + 0.5;
      context.strokeStyle = hour === 12 ? 'rgb(200,200,200)' : 'rgb(230,230,230)';
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(SIZE, y);
      context.stroke();
    }

    const columns = WEEKDAY_INDEXES.length;
    for (let column = 1; column < columns; column++) {
      context.beginPath();
      context.moveTo(column * (SIZE / columns), 0);
      context.lineTo(column * (SIZE / columns), SIZE);
      context.stroke();
    }
  }

  function drawSections(context: CanvasRenderingContext2D) {
    const columnWidth = SIZE / WEEKDAY_INDEXES.length;
    const heightPerHour = SIZE / timeRange.hours;

    for (const sectionId of permutation.sectionIds) {
      const section = catalog.getSection(sectionId);
      const courseId = catalog.getCourseIdOfSection(sectionId);
      if (section === undefined || courseId === undefined) continue;

      context.fillStyle = colorOf(courseId);

      for (const term of section.terms) {
        for (const [column, dayIndex] of WEEKDAY_INDEXES.entries()) {
          for (const period of section.periods) {
            if (!maskHasDay(period.days, dayIndex)) continue;

            const start = minutesToDecimalHours(period.startMinutes) - timeRange.startHour;
            const end = minutesToDecimalHours(period.endMinutes) - timeRange.startHour;

            context.fillRect(
              column * columnWidth + columnWidth * termIndex(term) * 0.25,
              start * heightPerHour,
              columnWidth * 0.25,
              (end - start) * heightPerHour,
            );
          }
        }
      }
    }
  }

  $effect(() => {
    if (canvas === undefined) return;
    const context = canvas.getContext('2d');
    if (context === null) return;

    // Reading these keeps the effect subscribed to the things it draws from.
    void permutation;
    void timeRange.startHour;
    void timeRange.endHour;

    context.clearRect(0, 0, SIZE, SIZE);
    drawBackground(context);
    drawSections(context);
  });
</script>

<button type="button" class="thumbnail" class:selected {onclick} aria-label="Show this schedule">
  <canvas bind:this={canvas} width={SIZE} height={SIZE}></canvas>
</button>

<style>
  .thumbnail {
    display: block;
    padding: 0;
    margin: 0 auto var(--space-3);
    border: 2px solid #ccc;
    border-radius: var(--radius-lg);
    background: var(--surface);
    cursor: pointer;
    line-height: 0;
    overflow: hidden;
  }

  .thumbnail.selected {
    border-color: var(--wpi-crimson);
  }

  canvas {
    width: 150px;
    height: 150px;
  }
</style>
