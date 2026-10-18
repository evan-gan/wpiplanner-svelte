import { describe, expect, it } from 'vitest';
import { RailViewState } from '$lib/state/railView.svelte';

describe('RailViewState', () => {
  it('starts with every course collapsed and the rail at the top', () => {
    const rail = new RailViewState();
    expect(rail.isExpanded('CS|2102')).toBe(false);
    expect(rail.scrollTop).toBe(0);
  });

  it('opens a course on the first toggle and closes it on the second', () => {
    const rail = new RailViewState();
    rail.toggleExpanded('CS|2102');
    expect(rail.isExpanded('CS|2102')).toBe(true);
    rail.toggleExpanded('CS|2102');
    expect(rail.isExpanded('CS|2102')).toBe(false);
  });

  it('keeps each course open or closed independently', () => {
    const rail = new RailViewState();
    rail.toggleExpanded('CS|2102');
    rail.toggleExpanded('MA|1021');
    rail.toggleExpanded('CS|2102');
    expect(rail.isExpanded('CS|2102')).toBe(false);
    expect(rail.isExpanded('MA|1021')).toBe(true);
  });
});
