<!--
  One class block on a week grid.

  Ported from `PeriodItem`: the course abbreviation on top, the period type
  centred, and the seat and waitlist counts along the bottom. The two lower lines
  hide themselves on a short block, exactly as `setHeight` did (24px and 34px).
-->
<script lang="ts">
  import type { PeriodJson } from '$lib/model/schedb';

  interface Props {
    period: PeriodJson;
    /** "CS 2102" — department and number, spaced as the old app had it. */
    title: string;
    color: string;
    /** Fraction of the column height, 0..1. */
    top: number;
    height: number;
    /** Dimmed when another section is being previewed. */
    dimmed: boolean;
    onclick: () => void;
  }

  let { period, title, color, top, height, dimmed, onclick }: Props = $props();

  /**
   * A short block only has room for its title.
   *
   * The legacy thresholds were 34px and 24px, with the lower two lines absolutely
   * positioned against the bottom edge — which overlapped the title on a block
   * barely over the threshold. The lines stack in flow here instead, so the
   * thresholds are the heights the three of them actually need.
   */
  const TYPE_VISIBLE_PX = 36;
  const SEATS_VISIBLE_PX = 24;

  let element: HTMLButtonElement | undefined = $state();
  let pixelHeight = $state(0);

  $effect(() => {
    if (element === undefined) return;
    const observer = new ResizeObserver(([entry]) => (pixelHeight = entry.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<button
  type="button"
  bind:this={element}
  class="period"
  class:dimmed
  style:top="{top * 100}%"
  style:height="{height * 100}%"
  style:background-color={color}
  title="{title} — {period.type}{period.location === '' ? '' : ` — ${period.location}`}"
  {onclick}
>
  <span class="title">{title}</span>
  {#if pixelHeight >= TYPE_VISIBLE_PX}
    <span class="type">{period.type}</span>
  {/if}
  {#if pixelHeight >= SEATS_VISIBLE_PX}
    <span class="seats">
      <span title="Seats available">&#128100; {period.seatsAvailable}/{period.seats}</span>
      <span title="Waitlist spots occupied">&#9200; {period.actualWaitlist}/{period.maxWaitlist}</span>
    </span>
  {/if}
</button>

<style>
  .period {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: hidden;
    text-align: center;
    border: 1px solid grey;
    border-radius: var(--radius-lg);
    cursor: pointer;
    font: inherit;
    color: var(--text);
    padding: 0;
    /* Above the week grid's hour markers and term watermark, which sit at 1. */
    z-index: 3;
  }

  .period.dimmed {
    opacity: 0.5;
    /* Still above the markers, but under the section being hovered. */
    z-index: 2;
  }

  .title {
    font-size: var(--font-size-small);
    line-height: 14px;
    white-space: nowrap;
  }

  .type {
    font-size: 11px;
    line-height: 12px;
    white-space: nowrap;
  }

  .seats {
    /* Pushed to the bottom edge, as it was in the old app. */
    margin-top: auto;
    align-self: flex-start;
    padding-left: 5px;
    font-size: var(--font-size-tiny);
    line-height: 10px;
    display: flex;
    gap: var(--space-2);
    white-space: nowrap;
  }
</style>
