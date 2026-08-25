import { describe, expect, it } from 'vitest';
import {
  SHARE_PARAM,
  SHARE_VERSION,
  buildShareUrl,
  decodeShareCode,
  encodeShareCode,
  readShareCode,
} from '$lib/share/shareCode';

const ids = ['CS|2102|BL01/BX01', 'MA|1021|A01'];

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
    expect(decodeShareCode(`${SHARE_VERSION}CS|2102|A01~~MA|1021|A01`)).toEqual([
      'CS|2102|A01',
      'MA|1021|A01',
    ]);
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
});
