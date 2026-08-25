/**
 * Rows shaped exactly like Workday's "View My Courses" export.
 *
 * The awkward parts of the real file are all represented: two banner rows above
 * the header, a blank first header cell, a lecture and a lab listed as separate
 * rows of one course, a `(group N)` note inside a section label, course titles
 * containing hyphens, and date columns holding raw serial numbers.
 */

/** The two banner rows and the header row, which every export starts with. */
export const WORKDAY_HEADER_ROWS: string[][] = [
  ['My Enrolled Courses'],
  ['', '', '', '', '', '', 'Enrolled Sections'],
  [
    '',
    'Course Listing',
    'Drop',
    'Swap',
    'Credits',
    'Grading Basis',
    'Section',
    'Registration Status',
    'Instructional Format',
    'Delivery Mode',
    'Meeting Patterns',
    'Instructor',
    'Start Date',
    'End Date',
  ],
];

export interface RowOptions {
  courseListing: string;
  section: string;
  termText: string;
  status?: string;
  instructionalFormat?: string;
}

/** One meeting row. */
export function workdayRow({
  courseListing,
  section,
  termText,
  status = 'Registered',
  instructionalFormat = 'Lecture',
}: RowOptions): string[] {
  return [
    `A Student - Computer Science Department/Undergraduate (BS) - 08/15/2026 - Active - ${courseListing} - ${termText}`,
    courseListing,
    '',
    '',
    '3',
    'Graded',
    section,
    status,
    instructionalFormat,
    'In-Person',
    'M-T-R-F | 9:00 AM - 9:50 AM | Fuller Labs 320',
    'A Professor',
    '46254',
    '46304',
  ];
}

/** A complete export: a lecture/lab course, a lecture-only course, and a dropped row. */
export function sampleExportRows(): string[][] {
  return [
    ...WORKDAY_HEADER_ROWS,
    workdayRow({
      courseListing: 'CS 1102 - Accelerated Introduction To Program Design',
      section: 'CS 1102-AL01 - Accelerated Introduction To Program Design',
      termText: '2026 Fall A Term',
    }),
    workdayRow({
      courseListing: 'CS 1102 - Accelerated Introduction To Program Design',
      section: 'CS 1102-AX01 - Accelerated Introduction To Program Design',
      termText: '2026 Fall A Term',
      instructionalFormat: 'Laboratory',
    }),
    workdayRow({
      courseListing: 'PH 1121 - Principles Of Physics-Electricity And Magnetism',
      section: 'PH 1121-BL02 (group 3) - Principles Of Physics-Electricity And Magnetism',
      termText: '2026 Fall B Term',
    }),
    workdayRow({
      courseListing: 'MA 1021 - Calculus I',
      section: 'MA 1021-A01 - Calculus I',
      termText: '2026 Fall A Term',
      status: 'Dropped',
    }),
  ];
}
