import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAY_BITS } from '../../../../src/lib/model/schedb.ts';
import { convertSchedb } from '../../src/convert.ts';

/**
 * A miniature catalog exercising the shapes that matter: a two-term section, a
 * cross-listed CRN, an unknown-days period, and a description shared between a
 * course and its section.
 */
const FIXTURE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>` +
  `<schedb generated="11:14 PM Feb 19, 2025" minutes-per-block="30">` +
  `<dept abbrev="CS" name="Computer Science">` +
  `<course course_desc="Shared blurb" max-credits="3" min-credits="3" name="Systems" number="2011">` +
  `<section actual_waitlist="0" availableseats="7" crn="000000000000320572" max_waitlist="10" number="A01" ` +
  `part-of-term="A Term, B Term" sec_desc="Shared blurb" seats="18" term="A Term, B Term">` +
  `<period actual_waitlist="0" availableseats="7" building="" days="mon,tue,thu,fri" ends="9:50AM" ` +
  `max_waitlist="10" professor="Ada Lovelace" room="Olin Hall 126 " seats="18" section="A01" starts="9:00AM" type="Lecture"/>` +
  `<period actual_waitlist="0" availableseats="7" building="SL" days="?" ends="2:50PM" ` +
  `max_waitlist="10" professor="" room="105" seats="18" section="A01" starts="2:00PM" type="Lab"/>` +
  `</section></course></dept>` +
  `<dept abbrev="IMGD" name="Interactive Media">` +
  `<course course_desc="Shared blurb" max-credits="3" min-credits="3" name="Systems" number="2011">` +
  `<section actual_waitlist="0" availableseats="7" crn="000000000000320572" max_waitlist="10" number="A01" ` +
  `part-of-term="A Term" sec_desc="Shared blurb" seats="18" term="A Term">` +
  `<period actual_waitlist="0" availableseats="7" building="" days="wed" ends="9:50AM" ` +
  `max_waitlist="10" professor="Ada Lovelace" room="Olin Hall 126" seats="18" section="A01" starts="9:00AM" type="Lecture"/>` +
  `</section></course></dept></schedb>`;

describe('convertSchedb structure', () => {
  const { data, stats } = convertSchedb(FIXTURE);

  it('carries the generation metadata from the root element', () => {
    assert.equal(data.generated, '11:14 PM Feb 19, 2025');
    assert.equal(data.minutesPerBlock, 30);
  });

  it('counts every level of the catalog', () => {
    assert.deepEqual(
      { departments: stats.departments, courses: stats.courses, sections: stats.sections, periods: stats.periods },
      { departments: 2, courses: 2, sections: 2, periods: 3 },
    );
  });

  it('builds stable ids from department, course, and section numbers', () => {
    assert.equal(data.departments[0].courses[0].id, 'CS|2011');
    assert.equal(data.departments[0].courses[0].sections[0].id, 'CS|2011|A01');
    assert.equal(data.departments[1].courses[0].sections[0].id, 'IMGD|2011|A01');
  });

  it('keeps the CRN as a string so 18-digit values do not lose precision', () => {
    const { crn } = data.departments[0].courses[0].sections[0];

    assert.equal(crn, '000000000000320572');
    assert.equal(typeof crn, 'string');
  });
});

describe('convertSchedb field mapping', () => {
  const { data } = convertSchedb(FIXTURE);
  const section = data.departments[0].courses[0].sections[0];

  it('splits a two-term label into ordered terms', () => {
    assert.equal(section.termLabel, 'A Term, B Term');
    assert.deepEqual(section.terms, ['A', 'B']);
  });

  it('encodes meeting days as a bitmask', () => {
    assert.equal(section.periods[0].days, DAY_BITS.mon | DAY_BITS.tue | DAY_BITS.thu | DAY_BITS.fri);
  });

  it('encodes an unknown day list as a zero mask', () => {
    assert.equal(section.periods[1].days, 0);
  });

  it('stores times as minutes since midnight', () => {
    assert.equal(section.periods[0].startMinutes, 9 * 60);
    assert.equal(section.periods[0].endMinutes, 9 * 60 + 50);
    assert.equal(section.periods[1].startMinutes, 14 * 60);
  });

  it('collapses building and room into a single trimmed location', () => {
    assert.equal(section.periods[0].location, 'Olin Hall 126');
    assert.equal(section.periods[1].location, 'SL 105');
  });
});

describe('convertSchedb description pooling', () => {
  it('stores a repeated description exactly once and points both records at it', () => {
    const { data, stats } = convertSchedb(FIXTURE);
    const course = data.departments[0].courses[0];

    assert.equal(stats.uniqueDescriptions, 1);
    assert.equal(data.descriptions[0], 'Shared blurb');
    assert.equal(course.descriptionIndex, 0);
    assert.equal(course.sections[0].descriptionIndex, 0);
  });

  it('uses -1 when there is no description text', () => {
    const withoutDescription = FIXTURE.replace(/course_desc="Shared blurb"/, 'course_desc="  "');
    const { data } = convertSchedb(withoutDescription);

    assert.equal(data.departments[0].courses[0].descriptionIndex, -1);
  });
});

describe('convertSchedb anomaly reporting', () => {
  const { anomalies } = convertSchedb(FIXTURE);
  const counts = anomalies.countByKind();

  it('flags a CRN shared by two cross-listed sections', () => {
    assert.equal(counts['duplicate-crn'], 1);
    assert.match(anomalies.all.find((entry) => entry.kind === 'duplicate-crn')!.detail, /cross-listed/);
  });

  it('flags a period whose days are unknown', () => {
    assert.equal(counts['unknown-days'], 1);
  });

  it('flags a period with no location', () => {
    assert.equal(counts['empty-location'], undefined, 'the fixture gives every period a location');
  });
});

describe('convertSchedb error handling', () => {
  it('rejects an element that is not part of the schedb format', () => {
    assert.throws(() => convertSchedb('<schedb generated="x" minutes-per-block="30"><bogus/></schedb>'), /Unexpected element/);
  });

  it('rejects a section that appears outside a course', () => {
    assert.throws(
      () => convertSchedb('<schedb generated="x" minutes-per-block="30"><section number="A01"/></schedb>'),
      /outside of a <course>/,
    );
  });

  it('names the missing attribute and the record it belongs to', () => {
    const missingSeats = FIXTURE.replace(' seats="18" term="A Term, B Term"', ' term="A Term, B Term"');

    assert.throws(() => convertSchedb(missingSeats), /Missing required attribute "seats" on CS\|2011\|A01/);
  });

  it('rejects a document with no departments', () => {
    assert.throws(
      () => convertSchedb('<schedb generated="x" minutes-per-block="30"></schedb>'),
      /contained no <dept> elements/,
    );
  });
});
