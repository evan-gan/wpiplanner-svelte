<!--
  One class in the search dropdown: the add/remove button, its code, its name.

  Clicking the row opens the course on the Courses tab; the button adds or
  removes it without leaving the search, so several classes can be picked in a
  row. The button mirrors `CourseRow` so it reads as the same control.
-->
<script lang="ts">
  import type { CourseHit } from '$lib/model/catalogSearch';

  interface Props {
    hit: CourseHit;
    chosen: boolean;
    onopen: () => void;
    ontoggleChosen: () => void;
  }

  let { hit, chosen, onopen, ontoggleChosen }: Props = $props();
</script>

<div class="result">
  <button
    type="button"
    class="toggle"
    class:chosen
    title={chosen ? `Remove ${hit.abbrev}` : `Add ${hit.abbrev}`}
    aria-label={chosen ? `Remove ${hit.abbrev}` : `Add ${hit.abbrev}`}
    onclick={ontoggleChosen}
  >
    {chosen ? '−' : '+'}
  </button>
  <button type="button" class="open" title="Show {hit.abbrev} on the Courses tab" onclick={onopen}>
    <span class="abbrev">{hit.abbrev}</span>
    <span class="name">{hit.name}</span>
  </button>
</div>

<style>
  .result {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 1px var(--space-2);
  }

  .result:hover {
    background: var(--surface-alt);
  }

  .toggle {
    flex: 0 0 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--toggle-add);
    border-radius: 50%;
    background: var(--toggle-add-bg);
    color: var(--toggle-add);
    font-weight: bold;
    line-height: 1;
    cursor: pointer;
  }

  .toggle.chosen {
    border-color: var(--toggle-remove);
    background: var(--toggle-remove-bg);
    color: var(--toggle-remove);
  }

  .open {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    gap: var(--space-3);
    align-items: baseline;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    padding: 3px 0;
  }

  .abbrev {
    flex: 0 0 auto;
    font-weight: bold;
  }

  .name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text-muted);
    font-size: var(--font-size-small);
  }
</style>
