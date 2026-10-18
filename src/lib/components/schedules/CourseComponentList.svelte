<!--
  One course's sections in the rail: each lecture, with the labs and
  discussions that can be taken with it nested underneath.

  The nesting follows `buildLectureEntries` (model/sectionComponents.ts): a
  professor who teaches two lectures appears twice, each time with that
  lecture's own labs. A lecture that is switched off folds its labs away, so
  the list only grows for the lectures the student is still considering.

  Every tick writes through `onsetSectionsDenied`, so the search sees one change
  per click. Rows are subgrids of the rail's grid (see SectionPicker).
-->
<script lang="ts">
  import type { CourseJson } from '$lib/model/schedb';
  import {
    buildCourseComponents,
    buildLectureEntries,
    closestSection,
    groupEntriesByTerm,
    componentAvailability,
    isComponentOn,
    isPlaceholderProfessor,
    sectionsForLinkedToggle,
    type LectureEntry,
    type SectionComponent,
  } from '$lib/model/sectionComponents';
  import ComponentRow from './ComponentRow.svelte';

  interface Props {
    course: CourseJson;
    isSectionDenied: (sectionId: string) => boolean;
    scheduledSectionIds: string[];
    color: string;
    onsetSectionsDenied: (sectionIds: string[], denied: boolean) => void;
    onhighlight: (sectionId: string | null) => void;
    onshowDetails: (sectionId: string) => void;
  }

  let {
    course,
    isSectionDenied,
    scheduledSectionIds,
    color,
    onsetSectionsDenied,
    onhighlight,
    onshowDetails,
  }: Props = $props();

  const components = $derived(buildCourseComponents(course));
  const termGroups = $derived(groupEntriesByTerm(buildLectureEntries(components), course));

  /** This course's section in the schedule on screen, if one is showing. */
  const scheduledSectionId = $derived(
    scheduledSectionIds.find((id) => components.composition.has(id)),
  );

  /**
   * The section the grid preview and the details dialog stand in for a
   * component with: the one closest to what is scheduled, so hovering a
   * discussion moves only the discussion on the grid.
   */
  function representative(component: SectionComponent): string {
    return closestSection(components, component.sectionIds, scheduledSectionId, isSectionDenied);
  }

  function isScheduled(component: SectionComponent): boolean {
    return component.sectionIds.some((id) => scheduledSectionIds.includes(id));
  }

  /**
   * What a nested row prints in the professor column: its own professor when
   * that is someone other than the lecturer, otherwise just what it is ("Lab").
   */
  function linkedCaption(entry: LectureEntry, component: SectionComponent): string {
    const ownProfessors = component.professors.filter(
      (name) => !entry.lecture.professors.includes(name) && !isPlaceholderProfessor(name),
    );
    return ownProfessors.length > 0
      ? `${component.type} · ${ownProfessors.join(', ')}`
      : component.type;
  }

  function toggleLinked(entry: LectureEntry, component: SectionComponent, turnOn: boolean) {
    onsetSectionsDenied(
      sectionsForLinkedToggle(components, entry, component, turnOn, isSectionDenied),
      !turnOn,
    );
  }
</script>

{#snippet row(
  component: SectionComponent,
  caption: string,
  nested: boolean,
  ontoggle: (turnOn: boolean) => void,
)}
  <ComponentRow
    {component}
    {caption}
    {nested}
    checked={isComponentOn(component, isSectionDenied)}
    availability={componentAvailability(component, course)}
    highlightColor={isScheduled(component) ? color : undefined}
    {ontoggle}
    onhighlight={(on) => onhighlight(on ? representative(component) : null)}
    onshowDetails={() => onshowDetails(representative(component))}
  />
{/snippet}

<ul class="components">
  {#each termGroups as termGroup (termGroup.label)}
    <!-- Only worth a divider when the course runs in more than one term. -->
    {#if termGroups.length > 1}
      <li class="term-divider"><span>{termGroup.label}</span></li>
    {/if}
    {#each termGroup.entries as entry (entry.lecture.number)}
      {@const lecture = entry.lecture}
      {@render row(
        lecture,
        lecture.professors.join(', ') || 'Unknown',
        false,
        (turnOn) => onsetSectionsDenied(lecture.sectionIds, !turnOn),
      )}
      {#if isComponentOn(lecture, isSectionDenied)}
        {#each entry.linked as group (group.type)}
          {#each group.components as component (component.number)}
            {@render row(component, linkedCaption(entry, component), true, (turnOn) =>
              toggleLinked(entry, component, turnOn),
            )}
          {/each}
        {/each}
      {/if}
    {/each}
  {/each}
</ul>

<style>
  .components {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    list-style: none;
    margin: 0;
    padding: 0 0 var(--space-2);
  }

  /* A thin rule with the term name sitting on it: ──── A-Term ──── */
  .term-divider {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-3) var(--space-2) var(--space-1);
    font-size: var(--font-size-small);
    font-weight: bold;
    color: var(--text-muted);
  }

  .term-divider::before,
  .term-divider::after {
    content: '';
    flex: 1 1 auto;
    border-top: 1px solid var(--border-muted);
  }

  .term-divider:first-child {
    margin-top: var(--space-1);
  }
</style>
