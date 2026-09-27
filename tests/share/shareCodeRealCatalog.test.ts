import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildShareUrl, decodeShareCode, readShareCode } from '$lib/share/shareCode';

const CATALOG_PATH = 'static/schedb.json';

interface CatalogFile {
  departments: { courses: { sections: { id: string }[] }[] }[];
}

function readAllSectionIds(): string[] {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as CatalogFile;
  return catalog.departments.flatMap((department) =>
    department.courses.flatMap((course) => course.sections.map((section) => section.id)),
  );
}

// Whatever the live feed names a section, a link to it must open that section.
describe.skipIf(!existsSync(CATALOG_PATH))('share codes over the real catalog', () => {
  it('round-trips every section id through a share URL', () => {
    const sectionIds = readAllSectionIds();
    const url = buildShareUrl('https://planner.wpi.edu/schedules/', sectionIds);
    expect(decodeShareCode(readShareCode(new URL(url))!)).toEqual(sectionIds);
  });
});
