import { describe, expect, it } from 'vitest';
import { readFirstSheet } from '$lib/workday/xlsx';
import { ZipArchive } from '$lib/workday/zip';
import { buildXlsx } from '../fixtures/xlsxBuilder';
import { sampleExportRows } from '../fixtures/workdayExport';

describe('readFirstSheet', () => {
  it('reads deflated shared strings back as the original grid', async () => {
    const rows = await readFirstSheet(await buildXlsx(sampleExportRows()));

    expect(rows[0][0]).toBe('My Enrolled Courses');
    expect(rows[2][1]).toBe('Course Listing');
    expect(rows[3][6]).toBe('CS 1102-AL01 - Accelerated Introduction To Program Design');
  });

  it('reads stored (uncompressed) parts as well as deflated ones', async () => {
    const rows = await readFirstSheet(await buildXlsx(sampleExportRows(), { compress: false }));
    expect(rows[2][1]).toBe('Course Listing');
  });

  it('reads inline strings, which some exporters emit instead of a string table', async () => {
    const rows = await readFirstSheet(await buildXlsx(sampleExportRows(), { inlineStrings: true }));
    expect(rows[2][1]).toBe('Course Listing');
  });

  it('keeps cells in their lettered columns when earlier cells are empty', async () => {
    const rows = await readFirstSheet(await buildXlsx([['', '', 'third']]));
    expect(rows[0]).toEqual(['', '', 'third']);
  });

  it('decodes XML entities in cell text', async () => {
    const rows = await readFirstSheet(await buildXlsx([['Ampersand & <angle> "quote"']]));
    expect(rows[0][0]).toBe('Ampersand & <angle> "quote"');
  });

  it('rejects a file that is not a ZIP at all', async () => {
    const notAWorkbook = new TextEncoder().encode('This is a CSV, not a workbook.');
    await expect(readFirstSheet(notAWorkbook)).rejects.toThrow(/not a readable \.xlsx/i);
  });

  it('rejects a ZIP that is not a workbook', async () => {
    const zipOfSomethingElse = await buildXlsx([['ignored']]);
    const archive = ZipArchive.open(zipOfSomethingElse);
    expect(archive.has('xl/workbook.xml')).toBe(true);

    // Corrupt the signature so the central directory cannot be found at all.
    const broken = zipOfSomethingElse.slice(0, zipOfSomethingElse.length - 22);
    await expect(readFirstSheet(broken)).rejects.toThrow(/not a readable \.xlsx/i);
  });
});

describe('ZipArchive', () => {
  it('lists every part it wrote', async () => {
    const archive = ZipArchive.open(await buildXlsx([['a']]));
    expect(archive.fileNames).toContain('xl/worksheets/sheet1.xml');
    expect(archive.fileNames).toContain('xl/sharedStrings.xml');
  });

  it('names the entries it has when asked for one it does not', async () => {
    const archive = ZipArchive.open(await buildXlsx([['a']]));
    await expect(archive.readText('xl/nope.xml')).rejects.toThrow(/no entry named/i);
  });
});
