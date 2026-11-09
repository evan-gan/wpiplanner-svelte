<!--
  A floating box opened at a point (normally the cursor), kept fully on
  screen by `placePopover`. Escape or a press outside it calls `onclose`.

  It knows nothing about what it holds; hover timing belongs to the caller
  (see `ui/hoverIntent.ts`), which is why pointer enter/leave are passed out.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { placePopover, type Point } from '$lib/ui/placePopover';

  interface Props {
    anchor: Point;
    children: Snippet;
    label: string;
    onclose: () => void;
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
    if (element !== null && !element.contains(event.target as Node)) onclose();
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
