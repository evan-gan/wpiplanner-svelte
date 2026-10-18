/**
 * How tall the Courses box should be so every chosen course shows without
 * scrolling — without pushing the description above it out of view.
 */

export interface FitPaneInput {
  /** Height the chosen-course list needs to show every row. */
  contentHeight: number;
  /** Height of the whole column the two panes share. */
  columnHeight: number;
  /** Height the description needs to show all its text. */
  descriptionHeight: number;
  /** The box's usual size; it only grows past this into space the description is not using. */
  defaultHeight: number;
  /** Neither pane is ever squeezed below this. */
  minHeight: number;
  /** The draggable divider between the panes. */
  dividerSize: number;
}

/**
 * The Courses box height for the current content.
 *
 * Up to `defaultHeight` the box simply fits its rows, shrinking as courses are
 * removed. Past it, the box grows only while the description still fits in
 * what is left; a long description keeps the box at its default and the list
 * scrolls instead, because having to scroll to read the description is worse.
 */
export function fitChosenPaneHeight(input: FitPaneInput): number {
  const { contentHeight, columnHeight, descriptionHeight, defaultHeight, minHeight, dividerSize } =
    input;
  const wanted = Math.max(minHeight, Math.ceil(contentHeight));
  if (wanted <= defaultHeight) return wanted;

  const usable = columnHeight - dividerSize;
  const leftOverByDescription = usable - descriptionHeight;
  const ceiling = Math.max(defaultHeight, Math.min(leftOverByDescription, usable - minHeight));

  return Math.min(wanted, ceiling);
}

export interface SquareCalendarInput {
  /** Size of the whole Schedules tab body. */
  containerWidth: number;
  containerHeight: number;
  /** Everything between the rail and the calendar: the sketch strip and both dividers. */
  middleWidth: number;
  /** The calendar's toolbar, which sits above the grids and is not part of the square. */
  toolbarHeight: number;
  minRailWidth: number;
  maxRailWidth: number;
}

/**
 * Rail width that leaves the calendar square, so the A–D grids are no wider
 * than they are tall and the spare width goes to the section list.
 *
 * Clamped both ways: a tall, narrow window still gets a usable rail, and a
 * very wide one does not stretch the rail past what its rows can use.
 */
export function railWidthForSquareCalendar(input: SquareCalendarInput): number {
  const { containerWidth, containerHeight, middleWidth, toolbarHeight, minRailWidth, maxRailWidth } =
    input;
  const calendarSide = containerHeight - toolbarHeight;
  const spare = containerWidth - middleWidth - calendarSide;

  return Math.round(Math.min(maxRailWidth, Math.max(minRailWidth, spare)));
}
