<!--
  A floating box opened at a point (where it was clicked or tapped), kept
  fully on screen by `placePopover`. It stays until Escape or a press outside
  it calls `onclose`.

  A press on an element marked `data-popover-trigger` is not "outside": the
  trigger's own click decides (normally toggling it shut). Without that, the
  press would close it and the click would immediately reopen it.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { placePopover, type Point } from '$lib/ui/placePopover';

  interface Props {
    anchor: Point;
    children: Snippet;
    label: string;
    onclose: () => void;
    /** Pointer enter/leave, for callers that open it on hover and need to keep it open. */
    onpointerenter?: () => void;
    onpointerleave?: () => void;
  }

  let { anchor, children, label, onclose, onpointerenter, onpointerleave }: Props = $props();

  let element = $state<HTMLElement | null>(null);
  let width = $state(0);
  let height = $state(0);
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);

  const position = $derived(placePopover({ anchor, width, height, viewportWidth, viewportHeight }));

  function closeOnOutsidePress(event: PointerEvent) {
    const target = event.target as Element;
    if (element === null || element.contains(target)) return;
    if (target.closest?.('[data-popover-trigger]')) return;
    onclose();
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose();
  }
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
  onpointerdown={closeOnOutsidePress}
  onkeydown={closeOnEscape}
/>

<div
  class="popover"
  role="dialog"
  tabindex="-1"
  aria-label={label}
  bind:this={element}
  bind:clientWidth={width}
  bind:clientHeight={height}
  style:left="{position.x}px"
  style:top="{position.y}px"
  {onpointerenter}
  {onpointerleave}
>
  {@render children()}
</div>

<style>
  .popover {
    position: fixed;
    z-index: 100;
    display: flex;
    flex-direction: column;
    width: min(720px, calc(100vw - 16px));
    max-height: 70vh;
    border: 1px solid var(--border-panel);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }
</style>
