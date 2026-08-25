<!--
  The description panel: title, catalog blurb, and the professors teaching it.

  `CourseDescriptionInfo` also had a seats readout, but every line of it was
  commented out in the deployed source, so it is not carried over.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import type { CourseJson } from '$lib/model/schedb';

  interface Props {
    catalog: Catalog;
    course: CourseJson | null;
  }

  let { catalog, course }: Props = $props();

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
</script>

<div class="details">
  {#if course === null}
    <p class="empty">Select a course to read its description.</p>
  {:else}
    <div class="title">{course.name}</div>
    <div class="description">{catalog.description(course.descriptionIndex)}</div>
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

  .empty {
    color: var(--text-muted);
  }
</style>
