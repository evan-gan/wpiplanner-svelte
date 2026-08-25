/** Hand a generated text file to the browser as a download. */
export function downloadTextFile(filename: string, mimeType: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  // Safari needs the anchor to have been clicked before the URL is released.
  URL.revokeObjectURL(url);
}
