/** Content-Disposition for a PDF shown in the browser; "save" offers the given name (as in the Cevi shop). */
export function pdfDisposition(filename: string) {
  const ascii = filename
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
