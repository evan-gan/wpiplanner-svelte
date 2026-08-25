<!-- A scrolling region that fills its parent. GWT's `ScrollPanel`. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    /** Horizontal overflow is hidden by default; wide tables opt in. */
    horizontal?: boolean;
    onscrollnearend?: () => void;
  }

  let { children, horizontal = false, onscrollnearend }: Props = $props();

  /** How close to the bottom counts as "near the end", in pixels. */
  const NEAR_END_THRESHOLD = 300;

  function onScroll(event: Event) {
    if (onscrollnearend === undefined) return;

    const element = event.currentTarget as HTMLElement;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < NEAR_END_THRESHOLD) onscrollnearend();
  }
</script>

<div class="scroll" class:horizontal onscroll={onScroll}>
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
