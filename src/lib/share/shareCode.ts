/**
 * The `?share=` link.
 *
 * The legacy format was `"01"` followed by each section's CRN as 18 hex digits.
 * That does not survive the move away from CRNs: 149 CRNs are shared by
 * cross-listed sections, so a shared link silently resolved into whichever
 * department parsed first, and the 18-digit values exceed
 * `Number.MAX_SAFE_INTEGER`. Codes now carry section ids, which are unique.
 *
 * Old links are **not** migrated — PLAN.md says so explicitly. A version prefix
 * makes an old link fail loudly instead of decoding into the wrong schedule.
 */

/** Query parameter name, unchanged from the old app. */
export const SHARE_PARAM = 'share';

/** Format marker. "01" was the legacy hex-CRN format. */
export const SHARE_VERSION = '02.';

const ID_SEPARATOR = '~';

/** Encode the sections of a schedule into a share code. */
export function encodeShareCode(sectionIds: readonly string[]): string {
  return SHARE_VERSION + sectionIds.join(ID_SEPARATOR);
}

/**
 * Decode a share code back into section ids.
 *
 * @throws Error when the code is not in the current format
 */
export function decodeShareCode(code: string): string[] {
  if (!code.startsWith(SHARE_VERSION)) {
    throw new Error(
      `This share link is not in the current format (expected it to start with ` +
        `"${SHARE_VERSION}"). Links created by the previous version of Planner cannot be opened.`,
    );
  }

  return code
    .slice(SHARE_VERSION.length)
    .split(ID_SEPARATOR)
    .filter((id) => id !== '');
}

/** The share code in a URL, or null when there is none. */
export function readShareCode(url: URL): string | null {
  const code = url.searchParams.get(SHARE_PARAM);
  return code === null || code === '' ? null : code;
}

/**
 * A copyable link to a schedule.
 *
 * Replaces any share code already in the URL, so re-sharing after picking a
 * different schedule does not stack parameters — the old `ShareWidget` did this
 * with `indexOf("?")` string surgery.
 */
export function buildShareUrl(currentUrl: string, sectionIds: readonly string[]): string {
  const url = new URL(currentUrl);
  url.searchParams.set(SHARE_PARAM, encodeShareCode(sectionIds));
  return url.toString();
}
