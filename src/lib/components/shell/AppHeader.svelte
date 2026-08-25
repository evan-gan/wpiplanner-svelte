<!--
  The crimson bar: "Planner", the academic year, the data refresh timestamp, and
  the optional link to last year's schedule.

  The legacy `MainView.ui.xml` built this out of nested `DockLayoutPanel`s with
  pixel sizes (50/185/280/36/14/11); it is a flex row here, but the text, the
  colours, and the sizes are the same.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { YearHeader } from '$lib/data/yearHeader';

  interface Props {
    header: YearHeader;
    /** Generation timestamp from the catalog. */
    generated: string;
    /** The tab bar, which sits on the right of the header. */
    tabs: Snippet;
  }

  let { header, generated, tabs }: Props = $props();
</script>

<header>
  <div class="identity">
    <div class="title">Planner</div>
    <div class="subtitle">{header.year}</div>
  </div>

  <div class="meta">
    {#if header.showOldScheduleLink}
      <div class="line">
        Looking for this year's schedule? <a href="/old">Click here.</a>
      </div>
    {/if}
    <div class="line">Schedule Data Refreshed: {generated}</div>
  </div>

  <nav class="tabs">
    {@render tabs()}
  </nav>
</header>

<style>
  header {
    display: flex;
    align-items: stretch;
    height: var(--header-height);
    background: var(--wpi-crimson);
    border-bottom: 1px solid #000;
    color: var(--text-on-brand);
  }

  .identity {
    flex: 0 0 185px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: var(--space-2);
  }

  .title {
    font-size: var(--font-size-header-title);
    line-height: 36px;
  }

  .subtitle {
    font-size: var(--font-size-header-sub);
    line-height: 14px;
  }

  .meta {
    flex: 0 1 280px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding-bottom: var(--space-1);
    min-width: 0;
  }

  .line {
    font-size: var(--font-size-header-sub);
    line-height: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta a {
    color: var(--text-on-brand);
    text-decoration: underline;
  }

  .tabs {
    flex: 1 1 auto;
    display: flex;
    justify-content: flex-end;
    align-items: stretch;
    min-width: 0;
    overflow: hidden;
  }

  /* Narrow viewports: the timestamp is the first thing worth dropping. */
  @media (max-width: 900px) {
    .meta {
      display: none;
    }
  }
</style>
