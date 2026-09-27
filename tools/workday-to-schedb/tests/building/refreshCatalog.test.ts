import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCHEDB_FORMAT_VERSION } from '../../../../src/lib/model/schedb.ts';
import type { ReportEntry } from '../../src/feed.ts';
import { refreshCatalog } from '../../src/refresh.ts';

const ENTRY: ReportEntry = {
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
};

const LAST_MODIFIED = 'Fri, 18 Sep 2026 20:30:02 GMT';

/** A `fetch` that answers every request with the given feed body. */
function feedFetch(body: string, status = 200): typeof fetch {
  return async () =>
    new Response(body, { status, headers: { 'last-modified': LAST_MODIFIED } });
}

describe('refreshCatalog', () => {
  it('turns a fetched feed into schedb.json and yearHeader.txt text', async () => {
    const refreshed = await refreshCatalog({
      fetchImpl: feedFetch(JSON.stringify({ Report_Entry: [ENTRY] })),
    });

    const schedb = JSON.parse(refreshed.schedbJson);
    assert.equal(schedb.formatVersion, SCHEDB_FORMAT_VERSION);
    assert.equal(schedb.departments[0].abbrev, 'CS');
    assert.equal(refreshed.yearHeaderText, '2026 - 2027 Academic Year\nfalse\n');
    assert.equal(refreshed.feedLastModified.toUTCString(), LAST_MODIFIED);
  });

  it('writes the old-schedule flag on line 2 of the year header when asked', async () => {
    const refreshed = await refreshCatalog({
      fetchImpl: feedFetch(JSON.stringify({ Report_Entry: [ENTRY] })),
      showOldLink: true,
    });
    assert.equal(refreshed.yearHeaderText.split('\n')[1], 'true');
  });

  it('passes the upstream status through when the feed request fails', async () => {
    await assert.rejects(
      refreshCatalog({ fetchImpl: feedFetch('', 503) }),
      /returned 503/,
    );
  });

  it('refuses an empty feed rather than serving an empty catalog', async () => {
    await assert.rejects(
      refreshCatalog({ fetchImpl: feedFetch(JSON.stringify({ Report_Entry: [] })) }),
      /zero sections/,
    );
  });
});
