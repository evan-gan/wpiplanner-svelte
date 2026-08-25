import { SchedbBuilder, type ConversionResult } from './mapSchedb.ts';
import { scanXml } from './xmlScanner.ts';

/**
 * Convert a `.schedb` XML document into the app's JSON wire format.
 *
 * @param source Full XML text of the export
 * @returns The mapped document, conversion counts, and any data-quality anomalies
 */
export function convertSchedb(source: string): ConversionResult {
  const builder = new SchedbBuilder();

  for (const event of scanXml(source)) {
    if (event.kind === 'open') {
      builder.openElement(event.tag.name, event.tag.attributes);
    } else {
      builder.closeElement(event.name);
    }
  }

  return builder.finish();
}
