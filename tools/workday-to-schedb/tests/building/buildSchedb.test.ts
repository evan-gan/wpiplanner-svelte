import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCHEDB_FORMAT_VERSION } from '../../../../src/lib/model/schedb.ts';
import { buildSchedb } from '../../src/buildSchedb.ts';
import type { ReportEntry } from '../../src/feed.ts';

const GENERATED = '11:10 PM Aug 24, 2026';

function entry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    Course_Section: 'CS 2102-A01 - Object-Oriented Design Concepts',
    Course_Title: 'CS 2102 - Object-Oriented Design Concepts',
    Offering_Period: '2026 Fall A Term',
    Starting_Academic_Period_Type: 'A Term',
    Instructional_Format: 'Lecture',
    Section_Status: 'Open',
    Section_Details: 'Fuller Labs 320 | M-T-R-F | 9:00 AM - 9:50 AM',
    Enrolled_Capacity: '18/25',
    Waitlist_Waitlist_Capacity: '0/10',
    Instructors: 'Ada Lovelace',
    Course_Description: '<p>An introduction.</p>',
    Credits: '3',
    CF_LRV_Cluster_Ref_ID: '',
    ...overrides,
  };
}

const build = (entries: ReportEntry[]) => buildSchedb(entries, { generated: GENERATED });

describe('buildSchedb', () => {
  it('nests one row into a department, course, section, and period', () => {
    const { data } = build([entry()]);

    assert.equal(data.formatVersion, SCHEDB_FORMAT_VERSION);
    assert.equal(data.generated, GENERATED);
    assert.deepEqual(
      data.departments.map((department) => [department.abbrev, department.name]),
      [['CS', 'Computer Science']],
    );

    const [course] = data.departments[0].courses;
    assert.equal(course.id, 'CS|2102');
    assert.equal(course.minCredits, 3);
    assert.equal(data.descriptions[course.descriptionIndex], 'An introduction.');

    const [section] = course.sections;
    assert.equal(section.id, 'CS|2102|A01');
    assert.deepEqual(section.terms, ['A']);
    assert.equal(section.periods.length, 1);
  });

  it('reports the academic year it inferred from the offering periods', () => {
    const { academicYear, yearHeaderLine } = build([entry()]);

    assert.deepEqual(academicYear, { fallYear: 2026, springYear: 2027 });
    assert.equal(yearHeaderLine, '2026 - 2027 Academic Year');
  });

  it('gathers every term of a course under one course entry', () => {
    const { data } = build([
      entry(),
      entry({
        Course_Section: 'CS 2102-C01 - Object-Oriented Design Concepts',
        Offering_Period: '2027 Spring C Term',
        Starting_Academic_Period_Type: 'C Term',
      }),
    ]);

    const [course] = data.departments[0].courses;
    assert.equal(course.sections.length, 2);
    assert.deepEqual(
      course.sections.map((section) => section.terms),
      [['A'], ['C']],
    );
  });

  it('never pairs components from different terms', () => {
    const { data } = build([
      entry({ Course_Section: 'CS 1004-AL01 - Intro' }),
      entry({
        Course_Section: 'CS 1004-BX01 - Intro',
        Offering_Period: '2026 Fall B Term',
        Starting_Academic_Period_Type: 'B Term',
        Instructional_Format: 'Laboratory',
        Section_Details: 'Fuller Labs 320 | W | 1:00 PM - 2:50 PM',
      }),
    ]);

    assert.deepEqual(
      data.departments[0].courses[0].sections.map((section) => section.id),
      ['CS|1004|AL01', 'CS|1004|BX01'],
    );
  });

  it('spans a semester-long section across both of its terms', () => {
    const { data } = build([
      entry({
        Course_Section: 'MA 501-F01 - Engineering Mathematics',
        Course_Title: 'MA 501 - Engineering Mathematics',
        Offering_Period: '2026 Fall Semester',
        Starting_Academic_Period_Type: 'Fall',
      }),
    ]);

    const [section] = data.departments[0].courses[0].sections;
    assert.equal(section.termLabel, 'A Term, B Term');
    assert.deepEqual(section.terms, ['A', 'B']);
  });

  it('files an unrecognised subject under "Other" and says so', () => {
    const { data, anomalies } = build([
      entry({ Course_Section: 'ZZ 1000-A01 - Unknown Studies', Course_Title: 'ZZ 1000 - Unknown Studies' }),
    ]);

    assert.deepEqual(
      data.departments.map((department) => department.abbrev),
      ['OT'],
    );
    assert.equal(anomalies.countByKind()['unknown-subject'], 1);
  });

  it('takes course credits from a real section, not from an interest list', () => {
    const { data } = build([
      entry({
        Course_Section: 'CH 1010-AL-Interest List - Chemical Properties',
        Course_Title: 'CH 1010 - Chemical Properties',
        Credits: '0',
        Section_Details: '',
      }),
      entry({
        Course_Section: 'CH 1010-AL01 - Chemical Properties',
        Course_Title: 'CH 1010 - Chemical Properties',
        Credits: '3',
      }),
    ]);

    const [course] = data.departments[0].courses;
    assert.equal(course.minCredits, 3);
    assert.deepEqual(
      course.sections.map((section) => section.number),
      ['Interest List-A Term', 'AL01'],
    );
  });

  it('leaves a section description empty when it only repeats the course text', () => {
    const { data } = build([
      entry(),
      entry({
        Course_Section: 'CS 2102-A02 - Object-Oriented Design Concepts',
        // Same words, different markup — Workday is inconsistent about <br />.
        Course_Description: '<p>An<br />introduction.</p>',
      }),
    ]);

    assert.deepEqual(
      data.departments[0].courses[0].sections.map((section) => section.descriptionIndex),
      [-1, -1],
    );
  });

  it('refuses to produce a catalog when every row was filtered out', () => {
    assert.throws(
      () => build([entry({ Section_Status: 'Canceled: Preliminary' })]),
      /nothing was converted/,
    );
  });

  it('counts what it converted', () => {
    const { stats } = build([entry(), entry({ Offering_Period: '2026 Summer' })]);

    assert.equal(stats.feedRows, 2);
    assert.equal(stats.plannableRows, 1);
    assert.equal(stats.departments, 1);
    assert.equal(stats.courses, 1);
    assert.equal(stats.sections, 1);
    assert.equal(stats.periods, 1);
  });
});
