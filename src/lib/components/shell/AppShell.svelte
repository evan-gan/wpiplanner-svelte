<!--
  The shell: header, tabs, and the current tab's body.

  This is where the app-level state is created and put into context, and where
  a `?share=` link is applied before anything renders.

  It is mounted only once the catalog has finished downloading (see
  `+layout.svelte`), so `catalog` is always present here.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import AppHeader from './AppHeader.svelte';
  import TabBar from './TabBar.svelte';
  import { AppState, setAppState } from '$lib/state/app.svelte';
  import { decodeShareCode, readShareCode, SHARE_PARAM } from '$lib/share/shareCode';
  import type { Catalog } from '$lib/model/catalog';
  import type { YearHeader } from '$lib/data/yearHeader';

  interface Props {
    catalog: Catalog;
    yearHeader: YearHeader;
    children: import('svelte').Snippet;
  }

  let { catalog, yearHeader, children }: Props = $props();

  // The catalog is fetched once and never changes, so reading it untracked here
  // keeps the app state from being rebuilt on any prop update.
  const app = setAppState(new AppState(untrack(() => catalog)));
  let shareError = $state<string | null>(null);

  onMount(() => {
    app.restore();
    applyShareLink();
    return () => app.dispose();
  });

  /**
   * A `?share=` link replaces the saved selection with the shared schedule.
   *
   * Each shared section becomes its course with every *other* section switched
   * off, so the shared schedule is the only one the generator can produce —
   * the behaviour of `loadScheduleFromParam`, minus the CRN ambiguity.
   */
  function applyShareLink() {
    const code = readShareCode($page.url);
    if (code === null) return;

    try {
      const sectionIds = decodeShareCode(code);
      const courses = [];

      for (const sectionId of sectionIds) {
        const courseId = app.catalog.getCourseIdOfSection(sectionId);
        if (courseId === undefined) continue;

        const course = app.catalog.requireCourse(courseId);
        courses.push({
          courseId,
          deniedSectionIds: course.sections
            .filter((section) => section.id !== sectionId)
            .map((section) => section.id),
        });
      }

      app.selection.replaceAll(courses);
      app.refresh();
    } catch (error) {
      shareError = error instanceof Error ? error.message : String(error);
    } finally {
      // Drop the parameter so a later reload does not re-apply a stale schedule.
      const url = new URL($page.url);
      url.searchParams.delete(SHARE_PARAM);
      void goto(`${url.pathname}${url.search}`, { replaceState: true, noScroll: true });
    }
  }
</script>

<div class="app">
  <AppHeader header={yearHeader} generated={catalog.generated}>
    {#snippet tabs()}
      <TabBar hasCourses={app.hasCourses} />
    {/snippet}
  </AppHeader>

  {#if shareError !== null}
    <p class="share-error" role="alert">
      {shareError}
      <button type="button" onclick={() => (shareError = null)}>Dismiss</button>
    </p>
  {/if}

  <main>
    {@render children()}
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  main {
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
  }

  .share-error {
    margin: 0;
    padding: var(--space-3);
    background: var(--term-denied);
    border-bottom: 1px solid var(--border-muted);
    font-size: var(--font-size-small);
  }
</style>
