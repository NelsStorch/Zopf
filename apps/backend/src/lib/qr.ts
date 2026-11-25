import QRCode from 'qrcode';
import { luminance } from '@zopf/shared';
import { drawLogo } from './invoice.js';

/** Dark enough to scan on white: brand colours lighter than this fall back to near black. */
export function scannable(hex: string): string {
  return luminance(hex) < 0.25 ? hex : '#18181b';
}

const isFinder = (r: number, c: number, n: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

/**
 * QR code drawn straight into a PDF in the club's look (same idea as the shift
 * planner): modules in the primary colour, the three corners in the secondary,
 * a white badge with the logo in the middle. Error correction H keeps it
 * readable despite the badge. Each colour is one path, which keeps the PDF small.
 */
export function drawBrandedQr(
  doc: PDFKit.PDFDocument,
  text: string,
  options: { x: number; y: number; size: number; primary: string; secondary: string; logo?: boolean }
) {
  const { x, y, size } = options;
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const m = size / n;
  const primary = scannable(options.primary);
  const secondary = scannable(options.secondary);
  const withLogo = options.logo !== false;

  let badge = withLogo ? Math.round(n * 0.22) : 0;
  if ((n - badge) % 2 !== 0) badge += 1;
  const from = (n - badge) / 2;
  const inBadge = (r: number, c: number) => withLogo && r >= from && r < from + badge && c >= from && c < from + badge;

  doc.save();
  doc.rect(x - 2 * m, y - 2 * m, size + 4 * m, size + 4 * m).fill('#ffffff');
  const draw = (wanted: (r: number, c: number) => boolean, color: string) => {
    let any = false;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.modules.get(r, c) || inBadge(r, c) || !wanted(r, c)) continue;
        doc.rect(x + c * m, y + r * m, m + 0.05, m + 0.05);
        any = true;
      }
    }
    if (any) doc.fill(color);
  };
  draw((r, c) => !isFinder(r, c, n), primary);
  draw((r, c) => isFinder(r, c, n), secondary);

  if (withLogo) {
    const bx = x + from * m;
    const by = y + from * m;
    const bs = badge * m;
    doc.lineWidth(Math.max(0.5, m * 0.2)).roundedRect(bx, by, bs, bs, m * 1.2).fillAndStroke('#ffffff', secondary);
    const pad = bs * 0.14;
    drawLogo(doc, bx + pad, by + pad, bs - 2 * pad);
  }
  doc.restore();
}

/** Plain black QR (e.g. the TWINT code, which must look like TWINT's own). */
export function drawPlainQr(doc: PDFKit.PDFDocument, text: string, x: number, y: number, size: number) {
  drawBrandedQr(doc, text, { x, y, size, primary: '#000000', secondary: '#000000', logo: false });
}
