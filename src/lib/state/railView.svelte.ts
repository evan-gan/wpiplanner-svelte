/**
 * How the student left the Schedules rail: which courses they opened and how
 * far down they had scrolled.
 *
 * Lives on `AppState` rather than in the page because SvelteKit unmounts the
 * Schedules route on every tab switch; kept here, coming back to the tab finds
 * the rail exactly as it was. Deliberately not persisted — a fresh visit starts
 * with every course collapsed.
 */
export class RailViewState {
  /** Courses the student expanded. Everything else is collapsed. */
  expandedCourseIds = $state<string[]>([]);
  /** The rail's scroll position in pixels, restored when the tab remounts. */
  scrollTop = $state(0);

  isExpanded(courseId: string): boolean {
    return this.expandedCourseIds.includes(courseId);
  }

  toggleExpanded(courseId: string): void {
    this.expandedCourseIds = this.isExpanded(courseId)
      ? this.expandedCourseIds.filter((id) => id !== courseId)
      : [...this.expandedCourseIds, courseId];
  }
}
