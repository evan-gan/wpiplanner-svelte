<!--
  The Export view of the Schedules tab: download the selected schedule as an
  `.ics` file for Google Calendar, Apple Calendar or Outlook.

  There is no equivalent in the legacy app. Term dates are not in the Workday
  export, so everything date-shaped comes from `$lib/config/academicCalendar`.
-->
<script lang="ts">
  import { ACADEMIC_CALENDAR, type AcademicCalendar } from '$lib/config/academicCalendar';
  import type { Catalog } from '$lib/model/catalog';
  import { formatTermLabel } from '$lib/model/terms';
  import ScrollArea from '$lib/components/primitives/ScrollArea.svelte';
  import { downloadTextFile } from '$lib/calendar/download';
  import {
    buildScheduleEvents,
    buildScheduleIcs,
    scheduleIcsFilename,
    type ScheduleExportOptions,
  } from '$lib/calendar/scheduleExport';

  interface Props {
    catalog: Catalog;
    sectionIds: string[];
    /** Injectable so a test can export against a calendar it controls. */
    calendar?: AcademicCalendar;
  }

  let { catalog, sectionIds, calendar = ACADEMIC_CALENDAR }: Props = $props();

  const REMINDER_CHOICES = [
    { minutes: null, label: 'No reminder' },
    { minutes: 5, label: '5 minutes before' },
    { minutes: 10, label: '10 minutes before' },
    { minutes: 15, label: '15 minutes before' },
    { minutes: 30, label: '30 minutes before' },
  ] as const;

  let includeAcademicCalendar = $state(true);
  let reminderMinutesBefore = $state<number | null>(null);
  let downloadError = $state<string | null>(null);

  const options = $derived<ScheduleExportOptions>({
    includeAcademicCalendar,
    reminderMinutesBefore,
  });

  const events = $derived(buildScheduleEvents(catalog, sectionIds, calendar, options));

  const counts = $derived({
    series: events.filter((event) => event.kind === 'timed' && event.recurrence).length,
    makeUps: events.filter((event) => event.kind === 'timed' && !event.recurrence).length,
    allDay: events.filter((event) => event.kind === 'allDay').length,
  });

  /** Terms the schedule occupies, with the config's dates for each. */
  const terms = $derived(
    calendar.terms.filter((dates) =>
      sectionIds.some((id) => catalog.getSection(id)?.terms.includes(dates.term)),
    ),
  );

  function formatDate(isoDate: string): string {
    return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(undefined, {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function download() {
    try {
      downloadError = null;
      downloadTextFile(
        scheduleIcsFilename(calendar),
        'text/calendar',
        buildScheduleIcs(catalog, sectionIds, calendar, options),
      );
    } catch (cause) {
      downloadError = cause instanceof Error ? cause.message : String(cause);
    }
  }
</script>

<ScrollArea>
  <div class="export">
    <h3>Export to calendar</h3>

    {#if sectionIds.length === 0}
      <p class="empty">Pick a schedule first — there is nothing to export yet.</p>
    {:else}
      <p class="lead">
        Downloads an <code>.ics</code> file covering the {calendar.academicYear}. Import it into
        Google Calendar, Apple Calendar or Outlook.
      </p>

      <table class="terms">
        <thead>
          <tr><th>Term</th><th>First day</th><th>Last day</th></tr>
        </thead>
        <tbody>
          {#each terms as dates (dates.term)}
            <tr>
              <td>{formatTermLabel(dates.term)}</td>
              <td>{formatDate(dates.firstDay)}</td>
              <td>{formatDate(dates.lastDay)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <fieldset>
        <legend>Options</legend>

        <label class="option">
          <input type="checkbox" bind:checked={includeAcademicCalendar} />
          Include no-class days and breaks as all-day events
        </label>

        <label class="option">
          Reminder before each class
          <select bind:value={reminderMinutesBefore}>
            {#each REMINDER_CHOICES as choice (choice.label)}
              <option value={choice.minutes}>{choice.label}</option>
            {/each}
          </select>
        </label>
      </fieldset>

      <p class="summary">
        {counts.series} repeating class {counts.series === 1 ? 'event' : 'events'}, {counts.makeUps}
        one-off {counts.makeUps === 1 ? 'meeting' : 'meetings'} on days that follow another
        weekday's schedule, and {counts.allDay} all-day calendar {counts.allDay === 1
          ? 'entry'
          : 'entries'}.
      </p>

      <button type="button" class="download" onclick={download}>Download .ics</button>

      {#if downloadError !== null}
        <p class="error" role="alert">The file could not be generated: {downloadError}</p>
      {/if}

      <p class="fine-print">
        Each class is one repeating event covering every day and every term it meets in, so
        renaming it or changing its reminder only has to be done once. Holidays, Wellness Days,
        Thanksgiving and the break between terms are already removed from those events, and days
        that follow another weekday's schedule are added as one-off meetings. Times are Worcester
        local time ({calendar.timeZoneId}), so they stay correct through the daylight
        saving change.
      </p>
    {/if}
  </div>
</ScrollArea>

<style>
  .export {
    padding: var(--space-4);
    max-width: 46rem;
  }

  h3 {
    margin: 0 0 var(--space-2);
  }

  .lead,
  .summary,
  .fine-print,
  .empty {
    font-size: var(--font-size-small);
    margin: 0 0 var(--space-3);
  }

  .fine-print {
    color: var(--text-muted);
  }

  .terms {
    border-collapse: collapse;
    font-size: var(--font-size-small);
    margin-bottom: var(--space-3);
  }

  .terms th,
  .terms td {
    border: 1px solid var(--border-subtle);
    padding: 3px 8px;
    text-align: left;
  }

  fieldset {
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    margin: 0 0 var(--space-3);
  }

  legend {
    font-size: var(--font-size-small);
    padding: 0 var(--space-1);
  }

  .option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-small);
    margin: var(--space-1) 0;
  }

  .download {
    font: inherit;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface-alt);
    cursor: pointer;
    margin-bottom: var(--space-3);
  }

  .download:hover {
    background: var(--surface-hover);
  }

  .error {
    color: var(--warn-full);
    font-size: var(--font-size-small);
  }
</style>
