<!--
  The ⚠ that marks a course or section with no seats left.

  Red means full, blue means full but with waitlist room — the two HTML snippets
  the legacy `CourseList` pasted inline. Both carry a tooltip, because the colour
  alone does not survive a colour-blind reader or a monochrome display.
-->
<script lang="ts">
  import type { Availability } from '$lib/model/availability';

  interface Props {
    availability: Availability;
  }

  let { availability }: Props = $props();

  const label = $derived(
    availability === 'waitlist'
      ? 'There are no seats left, but there are spots left on the waitlist.'
      : 'There are no seats left.',
  );
</script>

{#if availability !== 'open'}
  <span class="warning" class:waitlist={availability === 'waitlist'} title={label}>
    <span aria-hidden="true">&#9888;</span>
    <span class="sr-only">{label}</span>
  </span>
{/if}

<style>
  .warning {
    color: var(--warn-full);
    font-weight: bold;
  }

  .warning.waitlist {
    color: var(--warn-waitlist);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
