import { describe, expect, it } from 'vitest';
import {
  LEGACY_SHARE_VERSION,
  SHARE_PARAM,
  SHARE_VERSION,
  buildShareUrl,
  decodeShareCode,
  encodeShareCode,
  readShareCode,
} from '$lib/share/shareCode';

const ids = ['CS|2102|BL01/BX01', 'MA|1021|A01'];

/** Real catalog ids that exercise every escape path. */
const TRICKY_IDS = [
  'AR|174X|B01',
  'CE|404X|BL01/BX01',
  'BME|595|F01 - ST: Wearable/Mobile Sensors and Systems',
  "AR|2750|B02 - Topics In Studio Art: Printmaking for Artists' Books",
  'AR|2750|X cancel 3.30.26 - Topics In Studio Art: Art in the Makerspace',
  'CH|1010|Interest List-A Term',
  'XX|1000|A01 & ‘quoted’\u202fwith_under~tilde',
];

describe('encodeShareCode', () => {
  it('starts with the format version so a future change can be detected', () => {
    expect(encodeShareCode(ids).startsWith(SHARE_VERSION)).toBe(true);
  });

  it('round-trips a set of section ids', () => {
    expect(decodeShareCode(encodeShareCode(ids))).toEqual(ids);
  });

  it('round-trips a section number containing a slash', () => {
    expect(decodeShareCode(encodeShareCode(['CS|2102|BL01/BX01']))).toEqual(['CS|2102|BL01/BX01']);
  });

  it('encodes an empty schedule without producing a stray separator', () => {
    expect(decodeShareCode(encodeShareCode([]))).toEqual([]);
  });

  it('drops the pipes and swaps the slash so nothing needs percent-encoding', () => {
    expect(encodeShareCode(ids)).toBe(`${SHARE_VERSION}CS2102-BL01.BX01_MA1021-A01`);
  });

  it('uses only characters form encoding leaves alone, apart from the ~ escape', () => {
    const code = encodeShareCode(TRICKY_IDS);
    expect(code).toMatch(/^[A-Za-z0-9._~-]+$/);
  });

  it('round-trips real special-topic, cancelled, and letter-suffixed ids', () => {
    expect(decodeShareCode(encodeShareCode(TRICKY_IDS))).toEqual(TRICKY_IDS);
  });

  it('writes all three fields when the department and course would run together', () => {
    const odd = ['CS1|2102|A01', 'CS|X12|A01', 'CS||A01', '|2102|A01'];
    expect(decodeShareCode(encodeShareCode(odd))).toEqual(odd);
  });

  it('round-trips an id that does not have the usual three fields', () => {
    const odd = ['CS2102', 'CS|2102', 'CS|2102|A01|extra'];
    expect(decodeShareCode(encodeShareCode(odd))).toEqual(odd);
  });

  it('is much shorter in a URL than the v2 format it replaces', () => {
    const legacyUrl = new URL('https://planner.wpi.edu/schedules/');
    legacyUrl.searchParams.set(SHARE_PARAM, LEGACY_SHARE_VERSION + ids.join('~'));
    const url = buildShareUrl('https://planner.wpi.edu/schedules/', ids);
    expect(url.length).toBeLessThan(legacyUrl.toString().length - 10);
  });
});

describe('decodeShareCode with a v2 link', () => {
  it('still opens a v2 code, so links already shared keep working', () => {
    expect(decodeShareCode(`${LEGACY_SHARE_VERSION}CS|2102|BL01/BX01~MA|1021|A01`)).toEqual(ids);
  });

  it('still opens a v2 URL exactly as the previous version wrote it', () => {
    const url = new URL(
      'https://planner.wpi.edu/schedules/?share=02.CS%7C2102%7CBL01%2FBX01%7EMA%7C1021%7CA01',
    );
    expect(decodeShareCode(readShareCode(url)!)).toEqual(ids);
  });

  it('still opens a v2 id that contains spaces', () => {
    const url = new URL(
      'https://planner.wpi.edu/?share=02.BME%7C595%7CS02+-+ST%3A+Biofabrication',
    );
    expect(decodeShareCode(readShareCode(url)!)).toEqual(['BME|595|S02 - ST: Biofabrication']);
  });
});

describe('decodeShareCode', () => {
  it('rejects a code with no version prefix', () => {
    expect(() => decodeShareCode('CS|2102|A01')).toThrow(/version/i);
  });

  it('rejects a code from the legacy hex-CRN format', () => {
    // The old format was "01" followed by 18-hex-digit CRNs. It is not migrated:
    // CRNs are not unique, so those links resolved cross-listed courses wrongly.
    expect(() => decodeShareCode('01000000004E20AAAA')).toThrow(/version/i);
  });

  it('rejects an empty string', () => {
    expect(() => decodeShareCode('')).toThrow(/version/i);
  });

  it('drops entries that are blank rather than yielding empty ids', () => {
    expect(decodeShareCode(`${SHARE_VERSION}CS2102-A01__MA1021-A01`)).toEqual([
      'CS|2102|A01',
      'MA|1021|A01',
    ]);
    expect(decodeShareCode(`${LEGACY_SHARE_VERSION}CS|2102|A01~~MA|1021|A01`)).toEqual([
      'CS|2102|A01',
      'MA|1021|A01',
    ]);
  });
});

describe('decodeShareCode with a damaged v3 code', () => {
  it('rejects a truncated escape', () => {
    expect(() => decodeShareCode(`${SHARE_VERSION}CS2102-A~2`)).toThrow(/damaged/);
  });

  it('rejects an escape that is not hex', () => {
    expect(() => decodeShareCode(`${SHARE_VERSION}CS2102-A~ZZ`)).toThrow(/damaged/);
  });

  it('rejects escaped bytes that are not valid UTF-8', () => {
    expect(() => decodeShareCode(`${SHARE_VERSION}CS2102-A~FF`)).toThrow(/damaged/);
  });

  it('rejects a character the encoder never writes', () => {
    expect(() => decodeShareCode(`${SHARE_VERSION}CS|2102|A01`)).toThrow(/damaged/);
  });

  it('rejects a token with too many fields', () => {
    expect(() => decodeShareCode(`${SHARE_VERSION}CS-2102-A01-B`)).toThrow(/damaged/);
  });

  it('rejects a two-field token whose first field is not department + course', () => {
    expect(() => decodeShareCode(`${SHARE_VERSION}2102-A01`)).toThrow(/damaged/);
  });
});

describe('readShareCode', () => {
  it('pulls the code out of a query string', () => {
    const url = `https://planner.wpi.edu/?${SHARE_PARAM}=${SHARE_VERSION}CS%7C2102%7CA01`;
    expect(readShareCode(new URL(url))).toBe(`${SHARE_VERSION}CS|2102|A01`);
  });

  it('returns null when there is no share parameter', () => {
    // The legacy loader detected this by catching the NullPointerException that
    // Window.Location.getParameter threw. This is a plain null check.
    expect(readShareCode(new URL('https://planner.wpi.edu/'))).toBeNull();
  });

  it('returns null for an empty share parameter', () => {
    expect(readShareCode(new URL(`https://planner.wpi.edu/?${SHARE_PARAM}=`))).toBeNull();
  });
});

describe('buildShareUrl', () => {
  it('appends the code to a clean URL', () => {
    const url = buildShareUrl('https://planner.wpi.edu/schedules', ids);
    expect(new URL(url).searchParams.get(SHARE_PARAM)).toBe(encodeShareCode(ids));
  });

  it('replaces a share code already present rather than stacking a second one', () => {
    const first = buildShareUrl('https://planner.wpi.edu/schedules', ['CS|2102|A01']);
    const second = buildShareUrl(first, ids);
    expect(new URL(second).searchParams.getAll(SHARE_PARAM)).toHaveLength(1);
    expect(decodeShareCode(new URL(second).searchParams.get(SHARE_PARAM)!)).toEqual(ids);
  });

  it('leaves other query parameters alone', () => {
    const url = buildShareUrl('https://planner.wpi.edu/schedules?debug=1', ids);
    expect(new URL(url).searchParams.get('debug')).toBe('1');
  });

  it('writes the code into the URL unescaped', () => {
    const url = buildShareUrl('https://planner.wpi.edu/schedules/', TRICKY_IDS);
    expect(url).toContain(encodeShareCode(TRICKY_IDS));
    expect(url).not.toContain('%');
  });

  it('round-trips through the URL, escapes included', () => {
    const url = buildShareUrl('https://planner.wpi.edu/schedules/', TRICKY_IDS);
    expect(decodeShareCode(readShareCode(new URL(url))!)).toEqual(TRICKY_IDS);
  });
});
