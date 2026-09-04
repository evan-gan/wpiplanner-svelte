<!--
  One term's availability grid: Monday-Friday, 8:00AM-9:00PM in half hours.
  Every dimension is derived from `timeGrid.ts`; nothing here is hardcoded.

  Drag-select is the whole interaction. The legacy `TimeTable` did it with
  `MouseDown`/`MouseMove` handlers plus a global `MouseUp` on the root panel to
  catch releases outside the grid; pointer capture makes that a two-handler job
  and gets touch and pen for free.
-->
<script lang="ts">
  import type { TermName } from '$lib/model/schedb';
  import { formatClockTime } from '$lib/model/time';
  import { fullDayName } from '$lib/model/days';
  import { formatTermLabel } from '$lib/model/terms';
  import {
    CELLS_PER_HOUR,
    GRID_COLUMNS,
    GRID_ROWS,
    cellIndex,
    columnToDayIndex,
    rowToMinutes,
  } from '$lib/model/timeGrid';
  import TimeGridCell from './TimeGridCell.svelte';

  interface Cell {
    row: number;
    column: number;
  }

  interface Props {
    term: TermName;
    /** Flat, row-major availability for this term. */
    cells: boolean[];
    /** Called once, on release, with the rectangle the student dragged. */
    ondrag: (anchor: Cell, drop: Cell) => void;
  }

  let { term, cells, ondrag }: Props = $props();

  let anchor = $state<Cell | null>(null);
  let hovered = $state<Cell | null>(null);

  /** The state the in-progress drag would leave: the opposite of the anchor's. */
  const dragSelects = $derived(
    anchor === null ? false : !cells[cellIndex(anchor.row, anchor.column)],
  );

  const rows = Array.from({ length: GRID_ROWS }, (_, row) => row);
  const columns = Array.from({ length: GRID_COLUMNS }, (_, column) => column);

  function isInsideDrag(row: number, column: number): boolean {
    if (anchor === null || hovered === null) return false;

    return (
      row >= Math.min(anchor.row, hovered.row) &&
      row <= Math.max(anchor.row, hovered.row) &&
      column >= Math.min(anchor.column, hovered.column) &&
      column <= Math.max(anchor.column, hovered.column)
    );
  }

  function startDrag(event: PointerEvent, row: number, column: number) {
    // Capture on the grid so a release anywhere still ends the drag.
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    anchor = { row, column };
    hovered = { row, column };
    event.preventDefault();
  }

  function endDrag() {
    if (anchor !== null && hovered !== null) ondrag(anchor, hovered);
    anchor = null;
    hovered = null;
  }

  function cellLabel(row: number, column: number): string {
    return `${fullDayName(columnToDayIndex(column))} ${formatClockTime(rowToMinutes(row))}`;
  }
</script>

<svelte:window onpointerup={() => anchor !== null && endDrag()} />

<div
  class="time-grid"
  role="grid"
  aria-label="{formatTermLabel(term)} availability"
  style:--columns={GRID_COLUMNS}
>
  <div class="row header" role="row">
    <div class="term-label" role="columnheader">{formatTermLabel(term)}</div>
    {#each columns as column (column)}
      <div class="day-label" role="columnheader">
        {fullDayName(columnToDayIndex(column)).toUpperCase()}
      </div>
    {/each}
  </div>

  {#each rows as row (row)}
    <div class="row" role="row">
      <div class="hour-label" class:hour-boundary={row % CELLS_PER_HOUR === 0} role="rowheader">
        {formatClockTime(rowToMinutes(row))}
      </div>
      {#each columns as column (column)}
        <TimeGridCell
          selected={cells[cellIndex(row, column)]}
          previewing={isInsideDrag(row, column)}
          previewSelected={dragSelects}
          onHourBoundary={row % CELLS_PER_HOUR === 0}
          label={cellLabel(row, column)}
          onpointerdown={(event) => startDrag(event, row, column)}
          onpointerenter={() => {
            if (anchor !== null) hovered = { row, column };
          }}
        />
      {/each}
    </div>
  {/each}
</div>

<style>
  .time-grid {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    border: 2px solid var(--timegrid-border);
    border-collapse: collapse;
    user-select: none;
  }

  .row {
    display: grid;
    /* A fixed label column, then one equal column per weekday. */
    grid-template-columns: 44px repeat(var(--columns), 1fr);
    flex: 1 1 0;
    min-height: 0;
  }

  .row.header {
    flex: 0 0 18px;
  }

  .term-label {
    font-size: var(--font-size-small);
    font-weight: bold;
    text-align: center;
  }

  .day-label {
    font-size: var(--font-size-tiny);
    text-align: center;
    overflow: hidden;
    white-space: nowrap;
  }

  .hour-label {
    font-size: var(--font-size-tiny);
    text-align: left;
    border-right: 1px solid var(--timegrid-border);
    border-top: 1px dotted var(--timegrid-border);
    overflow: hidden;
  }

  .hour-label.hour-boundary {
    border-top-style: solid;
  }
</style>
