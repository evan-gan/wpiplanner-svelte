<!--
  Boots the app: paint the loading screen first, then fetch the catalog.

  The catalog used to be awaited in `+layout.ts`, which left the browser on a
  blank page for the whole download. Fetching it here, after mount, means the
  loading screen with its byte counter is on screen while the bytes arrive —
  the behaviour of the legacy `LoadSchedule` panel.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import AppShell from '$lib/components/shell/AppShell.svelte';
  import LoadingScreen from '$lib/components/shell/LoadingScreen.svelte';
  import { loadCatalog, type LoadProgress, type LoadStage } from '$lib/data/loadCatalog';
  import { EMPTY_YEAR_HEADER, loadYearHeader, type YearHeader } from '$lib/data/yearHeader';
  import type { Catalog } from '$lib/model/catalog';
  import '../app.css';

  interface Props {
    children: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  let catalog = $state<Catalog | null>(null);
  let yearHeader = $state<YearHeader>(EMPTY_YEAR_HEADER);
  let stage = $state<LoadStage>('connecting');
  let progress = $state<LoadProgress | null>(null);
  let loadError = $state<string | null>(null);

  onMount(() => {
    void startLoad();
  });

  /**
   * Fetch the catalog and the year header, leaving the loading screen up until
   * the catalog is ready.
   *
   * The header is small and independent: a slow or missing `yearHeader.txt`
   * must not hold up the catalog, so the two are fetched in parallel and only
   * the catalog can fail the boot.
   */
  async function startLoad(): Promise<void> {
    loadError = null;
    progress = null;
    stage = 'connecting';

    // Paths go through `base` so the app also works when deployed under a
    // subdirectory, and so a route like `/schedules/` does not resolve a bare
    // filename against itself.
    const headerRequest = loadYearHeader(fetch, `${base}/yearHeader.txt`);

    try {
      catalog = await loadCatalog({
        url: `${base}/schedb.json`,
        onStage: (next) => (stage = next),
        onProgress: (next) => (progress = next),
      });
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
      return;
    }

    yearHeader = await headerRequest;
  }
</script>

{#if catalog === null}
  <LoadingScreen {stage} {progress} error={loadError} onRetry={() => void startLoad()} />
{:else}
  <AppShell {catalog} {yearHeader}>
    {@render children()}
  </AppShell>
{/if}
