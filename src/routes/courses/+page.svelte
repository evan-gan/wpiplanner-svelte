<!--
  The Courses tab: browse departments, read a description, pick courses.

  Layout matches `CourseSelectorView.ui.xml` — a 250px department list on the
  west, a 250px column on the east split between the description and the
  "Courses" box, and the course table in the middle.
-->
<script lang="ts">
  import CourseDetails from '$lib/components/catalog/CourseDetails.svelte';
  import CourseTable from '$lib/components/catalog/CourseTable.svelte';
  import DepartmentPicker from '$lib/components/catalog/DepartmentPicker.svelte';
  import SelectedCourseList from '$lib/components/catalog/SelectedCourseList.svelte';
  import ScrollArea from '$lib/components/primitives/ScrollArea.svelte';
  import SplitPane from '$lib/components/primitives/SplitPane.svelte';
  import { MAX_COURSES } from '$lib/state/selection.svelte';
  import { getAppState } from '$lib/state/app.svelte';

  const app = getAppState();

  let departmentPaneWidth = $state(250);
  let detailPaneWidth = $state(250);
  let chosenPaneHeight = $state(250);

  const selectedCourse = $derived(
    app.selectedCourseId === null ? null : (app.catalog.getCourse(app.selectedCourseId) ?? null),
  );

  /**
   * Selecting the first course of the first department, as the legacy view did
   * when the department selection changed and nothing was selected yet.
   */
  $effect(() => {
    if (app.selectedCourseId !== null) return;

    const firstDepartment = app.selectedDepartments
      .map((abbrev) => app.catalog.getDepartment(abbrev))
      .find((department) => department !== undefined && department.courses.length > 0);

    if (firstDepartment !== undefined) app.selectedCourseId = firstDepartment.courses[0].id;
  });

  function toggleChosen(courseId: string) {
    if (app.selection.hasCourse(courseId)) app.removeCourse(courseId);
    else app.addCourse(courseId);
  }
</script>

<div class="courses">
  <SplitPane side="west" bind:size={departmentPaneWidth} minSize={140} maxSize={480}>
    {#snippet fixed()}
      <DepartmentPicker
        catalog={app.catalog}
        selected={app.selectedDepartments}
        onchange={(abbrevs) => app.setSelectedDepartments(abbrevs)}
      />
    {/snippet}

    {#snippet flexible()}
      <SplitPane side="east" bind:size={detailPaneWidth} minSize={180} maxSize={560}>
        {#snippet fixed()}
          <SplitPane side="south" bind:size={chosenPaneHeight} minSize={100} maxSize={700}>
            {#snippet fixed()}
              <ScrollArea>
                <div class="pane-heading">Courses</div>
                {#if app.courseLimitWarning}
                  <p class="limit" role="alert">
                    There is a limit of {MAX_COURSES} courses. Remove one before adding another.
                  </p>
                {/if}
                <SelectedCourseList
                  catalog={app.catalog}
                  courseIds={app.selection.courseIds}
                  isTermDenied={(courseId, term) => app.selection.isTermDenied(courseId, term)}
                  ontoggleTerm={(courseId, term) =>
                    app.setTermDenied(courseId, term, !app.selection.isTermDenied(courseId, term))}
                  onremove={(courseId) => app.removeCourse(courseId)}
                  onselect={(courseId) => (app.selectedCourseId = courseId)}
                  onundo={(courseId) => app.addCourse(courseId)}
                />
              </ScrollArea>
            {/snippet}

            {#snippet flexible()}
              <CourseDetails catalog={app.catalog} course={selectedCourse} />
            {/snippet}
          </SplitPane>
        {/snippet}

        {#snippet flexible()}
          <ScrollArea>
            <CourseTable
              catalog={app.catalog}
              departments={app.selectedDepartments}
              chosenCourseIds={app.selection.courseIds}
              selectedCourseId={app.selectedCourseId}
              onselect={(courseId) => (app.selectedCourseId = courseId)}
              ontoggleChosen={toggleChosen}
            />
          </ScrollArea>
        {/snippet}
      </SplitPane>
    {/snippet}
  </SplitPane>
</div>

<style>
  .courses {
    position: absolute;
    inset: 0;
  }

  .pane-heading {
    font-weight: bold;
    margin-bottom: 5px;
    padding: 3px;
    text-align: center;
    background: var(--surface-heading);
  }

  .limit {
    margin: 0 0 var(--space-2);
    padding: var(--space-2);
    background: var(--term-denied);
    font-size: var(--font-size-small);
  }
</style>
