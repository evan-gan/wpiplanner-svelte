<!--
  A thin rule with a term name sitting on it: ──── A-Term ────

  Used inside a course (lectures grouped by term) and at the top level of the
  rail (courses grouped by where the schedule puts them). `muted` draws the
  dashed, greyed version for the rail's "Not on schedule" group.
-->
<script lang="ts">
  interface Props {
    label: string;
    /** `li` inside a list, `div` elsewhere. */
    tag?: 'li' | 'div';
    muted?: boolean;
    /** Lets a parent find this divider again after a reorder (see `ui/stableReorder.ts`). */
    itemKey?: string;
  }

  let { label, tag = 'div', muted = false, itemKey }: Props = $props();
</script>

<svelte:element
  this={tag}
  class="term-divider"
  class:muted
  data-rail-key={itemKey}
  aria-disabled={muted || undefined}
>
  <span>{label}</span>
</svelte:element>

<style>
  .term-divider {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    /* Equal space above and below, so the rule sits midway between the rows it separates. */
    margin: var(--space-2);
    font-size: var(--font-size-small);
    font-weight: bold;
    color: var(--text-muted);
  }

  .term-divider::before,
  .term-divider::after {
    content: '';
    flex: 1 1 auto;
    border-top: 1px solid var(--border-muted);
  }

  /* "Not on schedule": nothing below it is on the calendar, so it reads as switched off. */
  .term-divider.muted {
    font-weight: normal;
    font-style: italic;
    opacity: 0.6;
  }

  .term-divider.muted::before,
  .term-divider.muted::after {
    border-top-style: dashed;
  }
</style>
