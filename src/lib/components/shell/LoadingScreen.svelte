<!--
  The plain white page shown while `schedb.json` downloads.

  This is the legacy `LoadSchedule` panel: a title, the current step, and a byte
  counter, on an unstyled page. It renders before any data exists, so it must not
  depend on the catalog or on app state.
-->
<script lang="ts">
  import type { LoadProgress, LoadStage } from '$lib/data/loadCatalog';

  interface Props {
    stage: LoadStage;
    progress: LoadProgress | null;
    /** Message from a failed load; the counter is hidden while it is set. */
    error: string | null;
    onRetry: () => void;
  }

  let { stage, progress, error, onRetry }: Props = $props();

  const STAGE_LABELS: Record<LoadStage, string> = {
    connecting: 'Connection to server open',
    downloading: 'Loading data from server...',
    parsing: 'Reading schedule database...',
  };
</script>

<div class="loading">
  <div>Loading scheduler database...</div>

  {#if error !== null}
    <div class="error" role="alert">{error}</div>
    <button type="button" onclick={onRetry}>Try again</button>
  {:else}
    <div>{STAGE_LABELS[stage]}</div>
    {#if progress !== null}
      <div>{progress.loaded}/{progress.total} bytes loaded!</div>
    {/if}
  {/if}
</div>

<style>
  /* Deliberately unstyled beyond the page background: this renders before the
     app's own chrome exists, and the legacy loading screen looked the same. */
  .loading {
    background: #fff;
    color: #000;
    font-family: sans-serif;
    padding: 8px;
  }

  .error {
    color: #b00;
    margin: 8px 0;
  }
</style>
