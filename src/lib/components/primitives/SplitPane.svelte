<!--
  A two-pane split with a draggable divider.

  Replaces GWT's `SplitLayoutPanel`, which the old app used with hardcoded pixel
  sizes (250 for the department list, 300 for the course rail, 170 for the
  thumbnail strip). Those sizes are preserved by the callers; what changed is
  that the panes flex instead of being absolutely positioned.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Which edge the fixed-size pane sits on. */
    side?: 'west' | 'east' | 'north' | 'south';
    /** Starting size of the fixed pane, in pixels. */
    size: number;
    minSize?: number;
    maxSize?: number;
    /** The fixed-size pane. */
    fixed: Snippet;
    /** The pane that takes the remaining space. */
    flexible: Snippet;
  }

  let { side = 'west', size = $bindable(), minSize = 80, maxSize = 900, fixed, flexible }: Props =
    $props();

  const isHorizontal = $derived(side === 'west' || side === 'east');
  const isLeading = $derived(side === 'west' || side === 'north');

  let container: HTMLDivElement;
  let dragging = $state(false);

  function clamp(value: number): number {
    return Math.min(maxSize, Math.max(minSize, value));
  }

  function onPointerDown(event: PointerEvent) {
    dragging = true;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;

    const bounds = container.getBoundingClientRect();
    const fromStart = isHorizontal ? event.clientX - bounds.left : event.clientY - bounds.top;
    const total = isHorizontal ? bounds.width : bounds.height;

    size = clamp(isLeading ? fromStart : total - fromStart);
  }

  function onPointerUp(event: PointerEvent) {
    dragging = false;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  /** Keyboard resizing, which the GWT splitter never supported. */
  function onKeyDown(event: KeyboardEvent) {
    const decrease = isHorizontal ? 'ArrowLeft' : 'ArrowUp';
    const increase = isHorizontal ? 'ArrowRight' : 'ArrowDown';
    const step = event.shiftKey ? 50 : 10;

    if (event.key === decrease) size = clamp(size + (isLeading ? -step : step));
    else if (event.key === increase) size = clamp(size + (isLeading ? step : -step));
    else return;

    event.preventDefault();
  }
</script>

<div
  class="split"
  class:horizontal={isHorizontal}
  class:reversed={!isLeading}
  bind:this={container}
>
  <div class="pane fixed" style:flex-basis="{size}px">
    {@render fixed()}
  </div>

  <!--
    The ARIA "window splitter" pattern: a focusable separator that responds to
    arrow keys. Svelte's a11y lint does not model that pattern, hence the ignore.
  -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="divider"
    class:dragging
    role="separator"
    aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
    aria-valuenow={size}
    tabindex="0"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onkeydown={onKeyDown}
  ></div>

  <div class="pane flexible">
    {@render flexible()}
  </div>
</div>

<style>
  .split {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    min-height: 0;
    min-width: 0;
  }

  .split.horizontal {
    flex-direction: row;
  }

  .split.reversed {
    flex-direction: column-reverse;
  }

  .split.horizontal.reversed {
    flex-direction: row-reverse;
  }

  .pane {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .fixed {
    flex-grow: 0;
    flex-shrink: 0;
  }

  .flexible {
    flex: 1 1 0;
  }

  .divider {
    flex: 0 0 5px;
    background: var(--border-subtle);
    cursor: row-resize;
    touch-action: none;
  }

  .horizontal .divider {
    cursor: col-resize;
  }

  .divider:hover,
  .divider.dragging,
  .divider:focus-visible {
    background: var(--border-muted);
    outline: none;
  }
</style>
