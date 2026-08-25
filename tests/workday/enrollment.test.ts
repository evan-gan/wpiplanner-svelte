import { describe, expect, it } from 'vitest';
import { parseEnrolledCourses } from '$lib/workday/enrollment';
import { WORKDAY_HEADER_ROWS, sampleExportRows, workdayRow } from '../fixtures/workdayExport';

describe('parseEnrolledCourses', () => {
  it('groups a lecture and its lab into one course', () => {
    const courses = parseEnrolledCourses(sampleExportRows());
    const accelerated = courses.find((course) => course.courseNumber === '1102');

    expect(accelerated).toMatchObject({ deptAbbrev: 'CS', courseNumber: '1102' });
    expect(accelerated?.sectionNumbers).toEqual(['AL01', 'AX01']);
  });

  it('reads the department, number, and title out of the course listing', () => {
    const [accelerated] = parseEnrolledCourses(sampleExportRows());
    expect(accelerated.title).toBe('Accelerated Introduction To Program Design');
  });

  it('keeps a title that contains hyphens intact', () => {
    const physics = parseEnrolledCourses(sampleExportRows()).find(
      (course) => course.deptAbbrev === 'PH',
    );
    expect(physics?.title).toBe('Principles Of Physics-Electricity And Magnetism');
  });

  it('strips a "(group N)" note from the section label', () => {
    const physics = parseEnrolledCourses(sampleExportRows()).find(
      (course) => course.deptAbbrev === 'PH',
    );
    expect(physics?.sectionNumbers).toEqual(['BL02']);
  });

  it('reads the term out of the long first column', () => {
    const [accelerated] = parseEnrolledCourses(sampleExportRows());
    expect(accelerated.termText).toBe('2026 Fall A Term');
  });

  it('ignores a dropped registration', () => {
    const courses = parseEnrolledCourses(sampleExportRows());
    expect(courses.map((course) => course.courseNumber)).not.toContain('1021');
  });

  it('keeps a waitlisted registration, which is still a section the student wants', () => {
    const courses = parseEnrolledCourses([
      ...WORKDAY_HEADER_ROWS,
      workdayRow({
        courseListing: 'CS 2102 - Object-Oriented Design Concepts',
        section: 'CS 2102-BL01 - Object-Oriented Design Concepts',
        termText: '2026 Fall B Term',
        status: 'Waitlisted',
      }),
    ]);
    expect(courses).toHaveLength(1);
  });

  it('separates the same course taken in two different terms', () => {
    const courses = parseEnrolledCourses([
      ...WORKDAY_HEADER_ROWS,
      workdayRow({
        courseListing: 'CS 2102 - Object-Oriented Design Concepts',
        section: 'CS 2102-BL01 - Object-Oriented Design Concepts',
        termText: '2026 Fall B Term',
      }),
      workdayRow({
        courseListing: 'CS 2102 - Object-Oriented Design Concepts',
        section: 'CS 2102-DL01 - Object-Oriented Design Concepts',
        termText: '2027 Spring D Term',
      }),
    ]);

    expect(courses).toHaveLength(2);
    expect(courses.map((course) => course.sectionNumbers)).toEqual([['BL01'], ['DL01']]);
  });

  it('finds the header wherever it sits, not at a fixed row', () => {
    const withExtraBanner = [['Something else entirely'], ...sampleExportRows()];
    expect(parseEnrolledCourses(withExtraBanner)).toHaveLength(2);
  });

  it('follows the header when Workday reorders the columns', () => {
    const rows = sampleExportRows();
    const [courseListingColumn, sectionColumn] = [1, 6];

    const swapped = rows.map((row) => {
      const copy = [...row];
      [copy[courseListingColumn], copy[sectionColumn]] = [copy[sectionColumn], copy[courseListingColumn]];
      return copy;
    });

    expect(parseEnrolledCourses(swapped)).toEqual(parseEnrolledCourses(rows));
  });

  it('explains itself when the sheet is not a course export', () => {
    expect(() => parseEnrolledCourses([['Name', 'Grade'], ['A Student', 'A']])).toThrow(
      /View My Courses/i,
    );
  });
});
