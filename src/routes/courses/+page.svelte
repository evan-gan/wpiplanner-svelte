<!--
  The Courses tab: browse departments, read a description, pick courses.

  Layout matches `CourseSelectorView.ui.xml` — a 250px department list on the
  west, a 250px column on the east split between the description and the
  "Courses" box, and the course table in the middle.

  Unlike the old app, the "Courses" box sizes itself to the chosen list (see
  `fitChosenPaneHeight`), and "+" flies a copy of the row into it.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import CourseDetails from '$lib/components/catalog/CourseDetails.svelte';
  import CourseTable from '$lib/components/catalog/CourseTable.svelte';
  import DepartmentPicker from '$lib/components/catalog/DepartmentPicker.svelte';
  import SelectedCourseList from '$lib/components/catalog/SelectedCourseList.svelte';
  import ScrollArea from '$lib/components/primitives/ScrollArea.svelte';
  import SplitPane from '$lib/components/primitives/SplitPane.svelte';
  import { DEFAULT_CHOSEN_PANE_HEIGHT } from '$lib/state/coursesView.svelte';
  import { MAX_COURSES } from '$lib/state/selection.svelte';
  import { getAppState } from '$lib/state/app.svelte';
  import { fitChosenPaneHeight } from '$lib/ui/fitPaneSize';
  import { captureFlightSource, flyToTarget } from '$lib/ui/flyToTarget';

  const app = getAppState();
  /** Pane sizes and scroll offsets live here so they survive a tab switch. */
  const view = app.coursesView;

  const MIN_PANE_HEIGHT = 100;
  /** Matches the divider's flex-basis in `SplitPane`. */
  const DIVIDER_SIZE = 5;
  /** `.details` padding, top and bottom, which its measured content excludes. */
  const DESCRIPTION_PADDING = 8;

  let columnHeight = $state(0);
  let chosenContentHeight = $state(0);
  let descriptionHeight = $state(0);
  let chosenList: HTMLDivElement;
  let courseTableHost: HTMLDivElement;

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

  /**
   * Scroll a newly selected course into view — one opened from the header
   * search may be far down the list. A selection the table already revealed
   * is skipped, so returning to the tab leaves the restored scroll alone.
   */
  $effect(() => {
    const courseId = app.selectedCourseId;
    if (courseId === null || courseId === untrack(() => view.revealedCourseId)) return;
    view.revealedCourseId = courseId;

    // Wait for the table to render and its scroll to be restored first, so
    // `nearest` only moves the list when the row really is off screen.
    // `rememberScroll` restores once more on the first frame; frame callbacks
    // run in the order they were requested, so this one lands after it.
    tick().then(() =>
      requestAnimationFrame(() => {
        courseTableHost
          ?.querySelector(`[data-course-id="${CSS.escape(courseId)}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      }),
    );
  });

  /**
   * Resize the Courses box whenever its list grows or shrinks.
   *
   * Only the list's height is tracked: re-fitting on every description change
   * would undo a manual drag each time the student clicked a different course.
   * Coming back to the tab measures the same list again, which is not a change,
   * so it keeps whatever size the student left the box at.
   */
  $effect(() => {
    const contentHeight = chosenContentHeight;
    untrack(() => {
      if (columnHeight === 0 || contentHeight === 0) return;
      if (contentHeight === view.fittedChosenContentHeight) return;
      view.fittedChosenContentHeight = contentHeight;
      view.chosenPaneHeight = fitChosenPaneHeight({
        contentHeight,
        columnHeight,
        descriptionHeight: descriptionHeight + DESCRIPTION_PADDING,
        defaultHeight: DEFAULT_CHOSEN_PANE_HEIGHT,
        minHeight: MIN_PANE_HEIGHT,
        dividerSize: DIVIDER_SIZE,
      });
    });
  });

  async function toggleChosen(courseId: string, row: HTMLElement) {
    if (app.selection.hasCourse(courseId)) {
      app.removeCourse(courseId);
      return;
    }
    const flight = captureFlightSource(row);
    if (app.addCourse(courseId) !== 'added') return;

    // Wait for the new row to exist in the Courses box before aiming at it.
    await tick();
    const target = chosenList.querySelector<HTMLElement>(
      `[data-course-id="${CSS.escape(courseId)}"]`,
    );
    if (target === null) return;

    target.scrollIntoView({ block: 'nearest' });
    await flyToTarget(flight, target);
  }
</script>

<div class="courses" bind:clientHeight={columnHeight}>
  <SplitPane side="west" bind:size={view.departmentPaneWidth} minSize={140} maxSize={480}>
    {#snippet fixed()}
      <DepartmentPicker
        catalog={app.catalog}
        selected={app.selectedDepartments}
        bind:scrollTop={view.departmentScrollTop}
        onchange={(abbrevs) => app.setSelectedDepartments(abbrevs)}
      />
    {/snippet}

    {#snippet flexible()}
      <SplitPane side="east" bind:size={view.detailPaneWidth} minSize={180} maxSize={560}>
        {#snippet fixed()}
          <SplitPane
            side="south"
            bind:size={view.chosenPaneHeight}
            minSize={MIN_PANE_HEIGHT}
            maxSize={700}
          >
            {#snippet fixed()}
              <ScrollArea bind:scrollTop={view.chosenListScrollTop}>
                <div bind:this={chosenList} bind:clientHeight={chosenContentHeight}>
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
                </div>
              </ScrollArea>
            {/snippet}

            {#snippet flexible()}
              <CourseDetails
                catalog={app.catalog}
                course={selectedCourse}
                bind:contentHeight={descriptionHeight}
              />
            {/snippet}
          </SplitPane>
        {/snippet}

        {#snippet flexible()}
          <ScrollArea bind:scrollTop={view.courseTableScrollTop}>
            <div bind:this={courseTableHost}>
              <CourseTable
                catalog={app.catalog}
                departments={app.selectedDepartments}
                chosenCourseIds={app.selection.courseIds}
                selectedCourseId={app.selectedCourseId}
                onselect={(courseId) => (app.selectedCourseId = courseId)}
                ontoggleChosen={toggleChosen}
              />
            </div>
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
