<!--
  One lecture, lab, or discussion in the section rail, on a single line:
  checkbox and label, professor, meeting times.

  The row is a subgrid of the rail's three columns, so professors and times
  start at the same x on every row; a long professor name ends in "…". A nested
  row (a lecture's lab) is indented inside the first column.

  Hovering previews it on the grid and the professor opens its details. Both
  act on a representative combined section, since the grid and the dialog only
  know whole sections.
-->
<script lang="ts">
  import type { Availability } from '$lib/model/availability';
  import { describeMeetings, type SectionComponent } from '$lib/model/sectionComponents';
  import WarningIcon from '$lib/components/primitives/WarningIcon.svelte';

  interface Props {
    component: SectionComponent;
    /** Professor column text: the lecturer, or "Lab · Name" for a nested row. */
    caption: string;
    /** A lab or discussion shown under its lecture. */
    nested?: boolean;
    checked: boolean;
    availability: Availability;
    /** The course colour when this component is in the schedule on screen. */
    highlightColor?: string;
    ontoggle: (turnOn: boolean) => void;
    onhighlight: (on: boolean) => void;
    onshowDetails: () => void;
  }

  let {
    component,
    caption,
    nested = false,
    checked,
    availability,
    highlightColor,
    ontoggle,
    onhighlight,
    onshowDetails,
  }: Props = $props();

  // A component meeting at two patterns (rare) shows both, joined on one line.
  const meetings = $derived(describeMeetings(component.periods).join(', '));
</script>

<li
  class:off={!checked}
  class:nested
  class:scheduled={highlightColor !== undefined}
  style:background-color={highlightColor}
  onpointerenter={() => onhighlight(true)}
  onpointerleave={() => onhighlight(false)}
>
  <label>
    <input type="checkbox" {checked} onchange={() => ontoggle(!checked)} />
    <span class="number" title={component.number}>{component.number}</span>
    <WarningIcon {availability} />
  </label>
  <button
    type="button"
    class="caption"
    title="{caption} — show details for {component.number}"
    onclick={onshowDetails}
  >
    {caption}
  </button>
  <span class="meeting">{meetings}</span>
</li>

<style>
  li {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    align-items: center;
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
  }

  li:hover {
    background: var(--surface-alt);
  }

  /* A switched-off row stays readable but steps back. */
  li.off {
    color: var(--text-muted);
  }

  label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    cursor: pointer;
    white-space: nowrap;
  }

  .nested label {
    padding-left: var(--space-5);
  }

  .number {
    font-weight: bold;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .nested .number {
    font-weight: normal;
  }

  .caption {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0;
  }

  .caption:hover {
    text-decoration: underline;
  }

  .nested .caption {
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  /* Muted grey is unreadable on a saturated course colour. */
  .scheduled .caption,
  .scheduled .meeting {
    color: var(--text);
  }

  .meeting {
    white-space: nowrap;
    font-size: var(--font-size-small);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
</style>
