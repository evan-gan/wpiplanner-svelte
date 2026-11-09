<!--
  The description panel: title, catalog blurb, the structured background (when
  it was read from this exact description), and the professors teaching it.

  `CourseDescriptionInfo` also had a seats readout, but every line of it was
  commented out in the deployed source, so it is not carried over.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import type { CourseJson } from '$lib/model/schedb';
  import type { CourseBackgroundStatus } from '$lib/model/courseBackground';
  import { uncheckedBackgroundNote } from '$lib/model/courseBackgroundText';
  import { loadCourseBackground } from '$lib/data/courseBackground';
  import CourseBackground from './CourseBackground.svelte';

  interface Props {
    catalog: Catalog;
    course: CourseJson | null;
    /** Height the text needs, whatever the pane's size; lets the Courses box avoid covering it. */
    contentHeight?: number;
  }

  let { catalog, course, contentHeight = $bindable(0) }: Props = $props();

  /** Distinct professor names across every period, in the order encountered. */
  const professors = $derived.by(() => {
    if (course === null) return [];
    const names: string[] = [];

    for (const section of course.sections) {
      for (const period of section.periods) {
        if (period.professor !== '' && !names.includes(period.professor)) {
          names.push(period.professor);
        }
      }
    }
    return names;
  });

  // Null while loading, so neither the block nor the "not checked" note flashes up for the wrong course.
  let background = $state<CourseBackgroundStatus | null>(null);
  const backgroundNote = $derived(background === null ? null : uncheckedBackgroundNote(background.status));

  $effect(() => {
    background = null;
    if (course === null) return;
    // Clicking through courses quickly can resolve loads out of order; only the latest may land.
    let superseded = false;
    loadCourseBackground(course.id, catalog.description(course.descriptionIndex)).then((known) => {
      if (!superseded) background = known;
    });
    return () => {
      superseded = true;
    };
  });
</script>

<div class="details">
  <div bind:clientHeight={contentHeight}>
    {#if course === null}
      <p class="empty">Select a course to read its description.</p>
    {:else}
      <div class="title">{course.name}</div>
      <div class="description">{catalog.description(course.descriptionIndex)}</div>
      <!-- Only background read from this exact description is shown; unchecked and stale get a warning instead. -->
      {#if background?.status === 'hasBackground'}
        <CourseBackground entry={background.entry} />
      {:else if backgroundNote !== null}
        <p class="unchecked-note">{backgroundNote}</p>
      {/if}
      <div class="professors">
        <b>Professors: </b>
        {#if professors.length > 0}
          <span>{professors.join(', ')}</span>
        {:else}
          <i>N/A</i>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .details {
    height: 100%;
    overflow: auto;
    padding: var(--space-2);
  }

  .title {
    font-weight: bold;
  }

  .description {
    white-space: pre-wrap;
  }

  .professors {
    margin-top: 15px;
  }

  .unchecked-note {
    margin: 15px 0 0;
    font-style: italic;
    color: var(--text-muted);
  }

  .empty {
    color: var(--text-muted);
  }
</style>
