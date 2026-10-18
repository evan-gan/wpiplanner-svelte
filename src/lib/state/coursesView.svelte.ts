/**
 * How the student left the Courses tab: pane sizes they dragged and how far
 * down each list was scrolled.
 *
 * Lives on `AppState` for the same reason as `RailViewState` — the route is
 * unmounted on every tab switch. Not persisted: a fresh visit starts at the
 * default layout. The departments ticked and the course being read are kept on
 * `AppState` itself, since they were already.
 */

export const DEFAULT_SIDE_PANE_WIDTH = 250;
export const DEFAULT_CHOSEN_PANE_HEIGHT = 250;

export class CoursesViewState {
  departmentPaneWidth = $state(DEFAULT_SIDE_PANE_WIDTH);
  detailPaneWidth = $state(DEFAULT_SIDE_PANE_WIDTH);
  chosenPaneHeight = $state(DEFAULT_CHOSEN_PANE_HEIGHT);
  /**
   * The "Courses" list height the box was last auto-fitted to. Remounting the
   * tab measures the same list again; comparing against this keeps that from
   * undoing a size the student dragged.
   */
  fittedChosenContentHeight = $state<number | null>(null);

  /**
   * The course the table last scrolled into view. Only a different selection
   * scrolls the table, so coming back to the tab keeps the student's offset.
   */
  revealedCourseId = $state<string | null>(null);

  departmentScrollTop = $state(0);
  courseTableScrollTop = $state(0);
  chosenListScrollTop = $state(0);
}
