import QRCode, { type QRCodeMaskPattern } from "qrcode";
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";

// Badge QR codes hold only the member's random token. Before a code is used we
// render it at several sizes and decode it with ZXing; if a mask pattern gives a
// code that doesn't read reliably, another mask is tried.

const QUIET = 4; // modules of white border
const TEST_SCALES = [2, 3, 5, 8];
const ECC = "M" as const;

function matrix(token: string, mask: number) {
  const qr = QRCode.create(token, { errorCorrectionLevel: ECC, maskPattern: mask as QRCodeMaskPattern });
  return { size: qr.modules.size, get: (x: number, y: number) => qr.modules.get(y, x) === 1 };
}

function render(token: string, mask: number, scale: number) {
  const m = matrix(token, mask);
  const side = (m.size + QUIET * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side).fill(255);
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) {
        const row = ((y + QUIET) * scale + dy) * side;
        pixels.fill(0, row + (x + QUIET) * scale, row + (x + QUIET + 1) * scale);
      }
    }
  }
  return { pixels, side };
}

// A washed-out, blurred copy: roughly what a phone sees with glare or a cheap print.
function degrade(pixels: Uint8ClampedArray, side: number) {
  const out = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < side && xx >= 0 && xx < side) {
            sum += pixels[yy * side + xx];
            n++;
          }
        }
      // Low contrast (80..185) plus a glare gradient across the code.
      const v = 80 + (sum / n / 255) * 105 + (x / side) * 40;
      out[y * side + x] = v;
    }
  }
  return out;
}

function decodes(token: string, mask: number): boolean {
  const reader = new QRCodeReader();
  const variants = TEST_SCALES.map((scale) => render(token, mask, scale));
  const soft = render(token, mask, 3);
  variants.push({ pixels: degrade(soft.pixels, soft.side), side: soft.side });
  for (const { pixels, side } of variants) {
    try {
      const result = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, side, side))));
      if (result.getText() !== token) return false;
    } catch {
      return false;
    }
    reader.reset();
  }
  return true;
}

// Finds a mask pattern whose QR code reads correctly at every test size.
export function pickReadableMask(token: string, preferred?: number | null): number {
  const order = [...(preferred != null ? [preferred] : []), 0, 1, 2, 3, 4, 5, 6, 7].filter((v, i, a) => a.indexOf(v) === i);
  for (const mask of order) if (decodes(token, mask)) return mask;
  throw new Error("No QR mask pattern produced a readable code");
}

// A new badge code that is known to read well. Very rarely no mask passes every test for a
// given code; then a fresh random code is tried instead.
export function readableBadge(makeToken: () => string): { token: string; mask: number } {
  for (let i = 0; i < 10; i++) {
    const token = makeToken();
    try {
      return { token, mask: pickReadableMask(token) };
    } catch {
      /* try another code */
    }
  }
  throw new Error("Could not make a readable QR code");
}

export function qrSvg(token: string, mask: number): string {
  const m = matrix(token, mask);
  const side = m.size + QUIET * 2;
  let path = "";
  for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(x, y)) path += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

// PNG with a whole number of pixels per module, so it must be shown at exactly `size` px
// (resizing a QR image blurs module edges and can make it unreadable).
export async function qrPng(token: string, mask: number, pxPerModule = 7): Promise<{ url: string; size: number }> {
  const modules = matrix(token, mask).size + QUIET * 2;
  const url = await QRCode.toDataURL(token, {
    errorCorrectionLevel: ECC,
    maskPattern: mask as QRCodeMaskPattern,
    margin: QUIET,
    scale: pxPerModule,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return { url, size: modules * pxPerModule };
}
