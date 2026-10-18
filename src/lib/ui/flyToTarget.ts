/**
 * Fly a copy of one element onto another, so the student sees where a click
 * sent something — used when "+" moves a course into the Courses box.
 *
 * The copy is a fixed-position clone animated with the Web Animations API, so
 * neither the source nor the layout around it moves. The target is hidden for
 * the length of the flight and revealed as the copy lands on it.
 */

const FLIGHT_DURATION_MS = 450;

/** A copy of the source taken before the click changed it, and where it was. */
export interface FlightSource {
  ghost: HTMLElement;
  rect: DOMRect;
}

/**
 * A detached copy of `source` with its computed size, laid over the page.
 *
 * A table row cannot render outside a table, so a `<tr>` is wrapped in one
 * whose width matches the original row.
 */
function createGhost(source: HTMLElement, sourceRect: DOMRect): HTMLElement {
  const copy = source.cloneNode(true) as HTMLElement;
  let ghost: HTMLElement = copy;

  if (copy.tagName === 'TR') {
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    table.style.borderSpacing = '0';
    table.style.tableLayout = 'fixed';
    body.append(copy);
    table.append(body);
    ghost = table;
  }

  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${sourceRect.left}px`,
    top: `${sourceRect.top}px`,
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`,
    margin: '0',
    zIndex: '1000',
    pointerEvents: 'none',
    overflow: 'hidden',
    background: 'var(--surface)',
    boxShadow: '0 4px 12px rgb(0 0 0 / 0.25)',
    borderRadius: 'var(--radius-md)',
  });
  ghost.setAttribute('aria-hidden', 'true');
  return ghost;
}

/**
 * Snapshot `source` now, so the copy shows it as it was before the click
 * re-rendered it (a "+" that has already turned into "−" would look wrong).
 */
export function captureFlightSource(source: HTMLElement): FlightSource {
  const rect = source.getBoundingClientRect();
  return { ghost: createGhost(source, rect), rect };
}

/**
 * Animate a captured copy from where it was to where `target` is.
 *
 * Resolves once the copy has landed and been removed. Does nothing (beyond
 * resolving) for students who ask for reduced motion.
 */
export async function flyToTarget(source: FlightSource, target: HTMLElement): Promise<void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const { ghost, rect: sourceRect } = source;
  const targetRect = target.getBoundingClientRect();
  document.body.append(ghost);

  const previousVisibility = target.style.visibility;
  target.style.visibility = 'hidden';

  // The target row may still be sliding open, so land at the source's height.
  const animation = ghost.animate(
    [
      {
        left: `${sourceRect.left}px`,
        top: `${sourceRect.top}px`,
        width: `${sourceRect.width}px`,
        opacity: 1,
      },
      {
        left: `${targetRect.left}px`,
        top: `${targetRect.top}px`,
        width: `${targetRect.width}px`,
        opacity: 0.6,
      },
    ],
    { duration: FLIGHT_DURATION_MS, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
  );

  try {
    await animation.finished;
  } catch {
    // `finished` rejects only when the animation is cancelled, e.g. the page
    // navigated away mid-flight; the cleanup below is all that is needed.
  } finally {
    ghost.remove();
    target.style.visibility = previousVisibility;
  }
}
