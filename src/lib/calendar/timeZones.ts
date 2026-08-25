/**
 * VTIMEZONE blocks for the zones the calendar config can name.
 *
 * A `DTSTART;TZID=America/New_York` line is only portable if the file also
 * carries the zone's rules: Google and Apple recognise IANA ids on their own,
 * but Outlook and strict validators reject a TZID with no VTIMEZONE. The
 * alternative — writing every meeting in UTC — silently shifts classes by an
 * hour once the term crosses a DST boundary, which every WPI term does.
 *
 * The RRULEs below are the standing US rules (second Sunday in March, first
 * Sunday in November) and so stay correct without a yearly edit.
 */

const AMERICA_NEW_YORK = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const BLOCKS_BY_ZONE_ID: Record<string, readonly string[]> = {
  'America/New_York': AMERICA_NEW_YORK,
};

/**
 * The VTIMEZONE lines for a zone id.
 *
 * @throws Error when the zone has no block here, which means the academic
 *   calendar named a zone nobody has written the rules for yet
 */
export function timeZoneBlock(timeZoneId: string): readonly string[] {
  const block = BLOCKS_BY_ZONE_ID[timeZoneId];
  if (block === undefined) {
    throw new Error(
      `No VTIMEZONE is defined for ${JSON.stringify(timeZoneId)}. Add one to ` +
        `src/lib/calendar/timeZones.ts before using that zone in the academic calendar.`,
    );
  }
  return block;
}
