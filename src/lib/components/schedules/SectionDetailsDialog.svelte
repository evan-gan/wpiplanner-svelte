<!--
  The section details modal: a table of its periods with the course description
  and structured background under it, beside the sections it conflicts with.

  Ported from `PeriodDescriptionDialogBox` + `PeriodDataGrid`. The dialog's title
  is still the section's own on/off checkbox.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import { dayMaskToNames } from '$lib/model/days';
  import { formatClockTime } from '$lib/model/time';
  import Modal from '$lib/components/primitives/Modal.svelte';
  import CopyText from '$lib/components/primitives/CopyText.svelte';
  import { formatCourseId } from '$lib/model/courseBackgroundText';
  import { sectionParts } from '$lib/model/sectionComponents';
  import CourseBackgroundForCourse from '$lib/components/catalog/CourseBackgroundForCourse.svelte';

  interface Props {
    catalog: Catalog;
    sectionId: string | null;
    /** Ids of sections that clash with this one. */
    conflictingSectionIds: readonly string[];
    denied: boolean;
    ontoggle: () => void;
    onclose: () => void;
  }

  let { catalog, sectionId, conflictingSectionIds, denied, ontoggle, onclose }: Props = $props();

  const section = $derived(sectionId === null ? null : (catalog.getSection(sectionId) ?? null));
  const courseId = $derived(sectionId === null ? null : (catalog.getCourseIdOfSection(sectionId) ?? null));
  // The lecture alone (CL02 of CL02/CD05/CX02), since that is what registration searches by.
  const lectureNumber = $derived(
    section === null ? '' : (sectionParts(section).find((part) => part.isLead)?.number ?? section.number),
  );
  const course = $derived(courseId === null ? null : (catalog.getCourse(courseId) ?? null));
  // The course's description, not the section's: the section's is often empty in the live feed,
  // and the course's is the text the structured background was read from.
  const description = $derived(course === null ? '' : catalog.description(course.descriptionIndex));
</script>

{#if section !== null && courseId !== null}
  <Modal open onclose={onclose} width="1100px">
    {#snippet title()}
      <label class="section-toggle">
        <input type="checkbox" checked={!denied} onchange={ontoggle} />
        {catalog.courseTitle(courseId)} - {section.number}
      </label>
    {/snippet}
    {#snippet actions()}
      <!-- Copied as "MA 1024" and "MA 1024-CL02", with the space, for pasting into searches elsewhere. -->
      <div class="copy-codes">
        <CopyText text={formatCourseId(courseId)} label="Copy course code" />
        <CopyText text="{formatCourseId(courseId)}-{lectureNumber}" label="Copy course and lecture section" />
      </div>
    {/snippet}

    <div class="layout">
      <div class="main">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Section</th>
                <th>Professor</th>
                <th>Location</th>
                <th>Type</th>
                <th>Seats Available</th>
                <th>Waitlist Spots Occupied</th>
                <th>Weekdays</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {#each section.periods as period, index (index)}
                <tr>
                  <td>{period.sectionNumber}</td>
                  <td>{period.professor}</td>
                  <td>{period.location}</td>
                  <td>{period.type}</td>
                  <td>{period.seatsAvailable}/{period.seats}</td>
                  <td>{period.actualWaitlist}/{period.maxWaitlist}</td>
                  <td>{dayMaskToNames(period.days).join(',') || '—'}</td>
                  <td>{formatClockTime(period.startMinutes)}</td>
                  <td>{formatClockTime(period.endMinutes)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="about">
          <p class="description">{description}</p>
          <CourseBackgroundForCourse {courseId} {description} />
        </div>
      </div>

      <aside>
        <h3>Conflicts:</h3>
        {#if conflictingSectionIds.length === 0}
          <p>There are no sections with time conflicts with this section.</p>
        {:else}
          <ul>
            {#each conflictingSectionIds as conflictId (conflictId)}
              {@const conflictCourseId = catalog.getCourseIdOfSection(conflictId)}
              <li>
                {conflictCourseId === undefined ? conflictId : catalog.courseAbbrev(conflictCourseId)}
                {catalog.getSection(conflictId)?.number ?? ''}
              </li>
            {/each}
          </ul>
        {/if}
      </aside>

    </div>
  </Modal>
{/if}

<style>
  .section-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
  }

  .copy-codes {
    display: flex;
    gap: var(--space-2);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 200px;
    gap: var(--space-4);
  }

  .about {
    margin-top: var(--space-3);
  }

  .description {
    margin: 0;
    white-space: pre-wrap;
  }

  .table-scroll {
    overflow-x: auto;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--font-size-small);
  }

  th,
  td {
    border: 1px solid var(--border-subtle);
    padding: 3px 6px;
    text-align: left;
    white-space: nowrap;
  }

  aside {
    max-height: 400px;
    overflow-y: auto;
    font-size: var(--font-size-small);
  }

  aside h3 {
    margin: 0 0 var(--space-2);
    font-size: large;
    font-weight: normal;
  }

  aside ul {
    margin: 0;
    padding-left: var(--space-5);
  }

  @media (max-width: 800px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
