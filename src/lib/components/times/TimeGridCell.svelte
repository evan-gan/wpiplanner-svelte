<!--
  One half-hour cell of the availability grid.

  Green means "I can have class then", pink means blocked — the legacy
  `TimeTable_Cell_Selected` / `_Deselected` colours. Rows alternate a solid and a
  dotted top border so the hour boundaries stay readable at small sizes.
-->
<script lang="ts">
  interface Props {
    selected: boolean;
    /** True while a drag is passing over this cell, showing its future state. */
    previewing: boolean;
    /** The state the in-progress drag would leave behind. */
    previewSelected: boolean;
    /** Half-hour rows get a dotted divider; whole hours get a solid one. */
    onHourBoundary: boolean;
    label: string;
    onpointerdown: (event: PointerEvent) => void;
    onpointerenter: () => void;
  }

  let {
    selected,
    previewing,
    previewSelected,
    onHourBoundary,
    label,
    onpointerdown,
    onpointerenter,
  }: Props = $props();

  const shown = $derived(previewing ? previewSelected : selected);
</script>

<div
  class="cell"
  class:selected={shown}
  class:hour-boundary={onHourBoundary}
  role="gridcell"
  tabindex="-1"
  aria-selected={shown}
  aria-label={label}
  {onpointerdown}
  {onpointerenter}
></div>

<style>
  .cell {
    background: var(--timegrid-deselected);
    border-right: 1px solid var(--timegrid-border);
    border-top: 1px dotted var(--timegrid-border);
    cursor: pointer;
    touch-action: none;
  }

  .cell.hour-boundary {
    border-top-style: solid;
  }

  .cell.selected {
    background: var(--timegrid-selected);
  }
</style>
