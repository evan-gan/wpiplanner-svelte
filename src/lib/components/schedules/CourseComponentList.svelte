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
  import type { FixTrigger } from '$lib/state/fixPanel.svelte';
  import type { Point } from '$lib/ui/placePopover';
  import ComponentRow from './ComponentRow.svelte';
  import TermDivider from './TermDivider.svelte';

  /** A fix trigger without the course, which the rail adds. */
  type ComponentFixTrigger = Omit<FixTrigger, 'courseId'>;

  interface Props {
    course: CourseJson;
    isSectionDenied: (sectionId: string) => boolean;
    scheduledSectionIds: string[];
    color: string;
    onsetSectionsDenied: (sectionIds: string[], denied: boolean) => void;
    onhighlight: (sectionId: string | null) => void;
    onshowDetails: (sectionId: string) => void;
    clashesOf: (sectionIds: readonly string[]) => string[];
    onfixesHover: (trigger: ComponentFixTrigger, point: Point | null) => void;
    onfixesClick: (trigger: ComponentFixTrigger, point: Point) => void;
  }

  let {
    course,
    isSectionDenied,
    scheduledSectionIds,
    color,
    onsetSectionsDenied,
    onhighlight,
    onshowDetails,
    clashesOf,
    onfixesHover,
    onfixesClick,
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

  function fixTriggerOf(component: SectionComponent): ComponentFixTrigger {
    return {
      componentNumber: component.number,
      componentSectionIds: component.sectionIds,
      pickedSectionId: representative(component),
    };
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
  clashLabels: string[],
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
    {clashLabels}
    onfixesHover={(point) => onfixesHover(fixTriggerOf(component), point)}
    onfixesClick={(point) => onfixesClick(fixTriggerOf(component), point)}
  />
{/snippet}

<ul class="components">
  {#each termGroups as termGroup (termGroup.label)}
    <!-- Only worth a divider when the course runs in more than one term. -->
    {#if termGroups.length > 1}
      <TermDivider tag="li" label={termGroup.label} />
    {/if}
    {#each termGroup.entries as entry (entry.lecture.number)}
      {@const lecture = entry.lecture}
      {@const lectureClashes = clashesOf(lecture.sectionIds)}
      {@render row(
        lecture,
        lecture.professors.join(', ') || 'Unknown',
        false,
        (turnOn) => onsetSectionsDenied(lecture.sectionIds, !turnOn),
        lectureClashes,
      )}
      {#if isComponentOn(lecture, isSectionDenied)}
        {#each entry.linked as group (group.type)}
          {#each group.components as component (component.number)}
            <!-- Under a clashing lecture every lab clashes too; the lecture's link says it once. -->
            {@render row(
              component,
              linkedCaption(entry, component),
              true,
              (turnOn) => toggleLinked(entry, component, turnOn),
              lectureClashes.length > 0 ? [] : clashesOf(component.sectionIds),
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
</style>
