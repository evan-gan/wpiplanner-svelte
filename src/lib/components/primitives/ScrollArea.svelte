<!-- A scrolling region that fills its parent. GWT's `ScrollPanel`. -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { rememberScroll } from '$lib/ui/rememberScroll';

  interface Props {
    children: Snippet;
    /** Horizontal overflow is hidden by default; wide tables opt in. */
    horizontal?: boolean;
    onscrollnearend?: () => void;
    /**
     * Vertical scroll position. Bind it to keep the position somewhere that
     * outlives this component; it is applied once on mount, then only written.
     */
    scrollTop?: number;
  }

  let {
    children,
    horizontal = false,
    onscrollnearend,
    scrollTop = $bindable(0),
  }: Props = $props();


  /** How close to the bottom counts as "near the end", in pixels. */
  const NEAR_END_THRESHOLD = 300;

  function onScroll(event: Event) {
    if (onscrollnearend === undefined) return;

    const element = event.currentTarget as HTMLElement;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < NEAR_END_THRESHOLD) onscrollnearend();
  }
</script>

<div class="scroll" class:horizontal onscroll={onScroll}
  use:rememberScroll={{
    read: () => untrack(() => scrollTop),
    write: (offset) => (scrollTop = offset),
  }}
>
  {@render children()}
</div>

<style>
  .scroll {
    height: 100%;
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .scroll.horizontal {
    overflow-x: auto;
  }
</style>
