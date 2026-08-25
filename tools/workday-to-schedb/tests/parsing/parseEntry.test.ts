import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReportEntry } from '../../src/feed.ts';
import { meetingTypeFor, parseCapacityPair, parseEntry, termLabelFor } from '../../src/parseEntry.ts';
import { AnomalyLog } from '../../src/report.ts';

/** A plausible feed row; each test overrides only the fields it cares about. */
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
    Waitlist_Waitlist_Capacity: '2/10',
    Instructors: 'Ada Lovelace',
    Course_Description: '<p>Cat. I<br />An introduction.</p>',
    Credits: '3',
    CF_LRV_Cluster_Ref_ID: '',
    ...overrides,
  };
}

function parse(overrides: Partial<ReportEntry> = {}) {
  const log = new AnomalyLog();
  const parsed = parseEntry(entry(overrides), log);
  assert.ok(parsed !== null, 'expected the row to parse');
  return { parsed, log };
}

describe('parseEntry', () => {
  it('splits a course section into subject, number, and section label', () => {
    const { parsed } = parse();

    assert.equal(parsed.subjectCode, 'CS');
    assert.equal(parsed.courseNumber, '2102');
    assert.equal(parsed.sectionNumber, 'A01');
    assert.equal(parsed.courseName, 'Object-Oriented Design Concepts');
  });

  it('keeps a course title that contains its own hyphens', () => {
    const { parsed } = parse({
      Course_Section: 'PH 1121-BX29 - Principles Of Physics-Electricity And Magnetism',
      Course_Title: 'PH 1121 - Principles Of Physics-Electricity And Magnetism',
    });

    assert.equal(parsed.sectionNumber, 'BX29');
    assert.equal(parsed.courseName, 'Principles Of Physics-Electricity And Magnetism');
  });

  it('drops a registrar parenthetical from the section label', () => {
    const { parsed } = parse({
      Course_Section: 'MA 2612-DX02 (group 1) - Applied Statistics II',
      Course_Title: 'MA 2612 - Applied Statistics II',
    });

    assert.equal(parsed.sectionNumber, 'DX02');
  });

  it('labels an interest list by its term and gives it no instructor', () => {
    const { parsed } = parse({
      Course_Section: 'CH 1010-AL-Interest List - Chemical Properties, Bonding, And Forces',
      Course_Title: 'CH 1010 - Chemical Properties, Bonding, And Forces',
      Starting_Academic_Period_Type: 'A Term',
    });

    assert.equal(parsed.isInterestList, true);
    assert.equal(parsed.sectionNumber, 'Interest List-A Term');
    assert.equal(parsed.instructor, 'N/A');
  });

  it('keeps the full title in the label of a special-topics section', () => {
    const { parsed } = parse({
      Course_Section: 'HU 3900-A01 - INQ SEM: Early American History',
      Course_Title: 'HU 3900 - Inquiry Seminar In Humanities And Arts',
    });

    assert.equal(parsed.isSpecial, true);
    assert.equal(parsed.sectionNumber, 'A01 - INQ SEM: Early American History');
  });

  it('treats a "- ST:" marker as special even outside the listed courses', () => {
    const { parsed } = parse({
      Course_Section: 'AR 2750-C01 - ST: Art in the Makerspace',
      Course_Title: 'AR 2750 - Topics In Studio Art',
    });

    assert.equal(parsed.isSpecial, true);
    assert.equal(parsed.sectionNumber, 'C01 - ST: Art in the Makerspace');
  });

  it('names an instructor Workday left blank', () => {
    const { parsed } = parse({ Instructors: '' });
    assert.equal(parsed.instructor, 'Not Assigned');
  });

  it('strips HTML from the description', () => {
    const { parsed } = parse();
    assert.equal(parsed.description, 'Cat. I An introduction.');
  });

  it('derives seats and waitlist from the two capacity pairs', () => {
    const { parsed } = parse();

    assert.equal(parsed.seats, 25);
    assert.equal(parsed.seatsAvailable, 7);
    assert.equal(parsed.actualWaitlist, 2);
    assert.equal(parsed.maxWaitlist, 10);
  });

  it('reports a row whose course section does not name a section at all', () => {
    const log = new AnomalyLog();
    const parsed = parseEntry(entry({ Course_Section: 'Not a course section' }), log);

    assert.equal(parsed, null);
    assert.equal(log.countByKind()['unparsable-course-section'], 1);
  });
});

describe('termLabelFor', () => {
  it('expands a semester into the two terms it covers', () => {
    assert.equal(termLabelFor('Fall'), 'A Term, B Term');
    assert.equal(termLabelFor('Spring'), 'C Term, D Term');
  });

  it('passes a quarter term through unchanged', () => {
    assert.equal(termLabelFor('B Term'), 'B Term');
  });
});

describe('meetingTypeFor', () => {
  it('shortens Workday\'s "Laboratory" to the label the planner shows', () => {
    assert.equal(meetingTypeFor('Laboratory'), 'Lab');
  });

  it('leaves every other format alone', () => {
    assert.equal(meetingTypeFor('Lecture'), 'Lecture');
    assert.equal(meetingTypeFor('Seminar'), 'Seminar');
  });
});

describe('parseCapacityPair', () => {
  it('splits "used/total"', () => {
    assert.deepEqual(parseCapacityPair('16/25', 'where', new AnomalyLog()), { used: 16, total: 25 });
  });

  it('reports a malformed pair instead of producing NaN seats', () => {
    const log = new AnomalyLog();

    assert.deepEqual(parseCapacityPair('', 'CS|2102', log), { used: 0, total: 0 });
    assert.equal(log.countByKind()['unparsable-capacity'], 1);
  });
});
