<!--
  The text listing of the selected schedule: one block per section with all of
  its period rows.

  Ported from `DetailedView` + `PeriodDataGrid`.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import { dayMaskToNames } from '$lib/model/days';
  import { formatClockTime } from '$lib/model/time';
  import ScrollArea from '$lib/components/primitives/ScrollArea.svelte';

  interface Props {
    catalog: Catalog;
    sectionIds: string[];
  }

  let { catalog, sectionIds }: Props = $props();
</script>

<ScrollArea>
  <div class="detail">
    {#each sectionIds as sectionId (sectionId)}
      {@const section = catalog.getSection(sectionId)}
      {@const courseId = catalog.getCourseIdOfSection(sectionId)}
      {#if section !== undefined && courseId !== undefined}
        <section>
          <div class="heading">
            <h3>{catalog.courseTitle(courseId)}</h3>
            <div>Section(s): {section.number}</div>
          </div>

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
        </section>
      {/if}
    {/each}
  </div>
</ScrollArea>

<style>
  .detail {
    padding: var(--space-2);
  }

  section {
    display: grid;
    grid-template-columns: 30% 70%;
    gap: var(--space-3);
    align-items: start;
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
    margin-bottom: var(--space-2);
  }

  h3 {
    margin: 0 0 var(--space-2);
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

  @media (max-width: 800px) {
    section {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
