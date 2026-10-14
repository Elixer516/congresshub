// Reads QR codes from the camera video. Uses the phone's built-in detector when it has one
// (fast, e.g. Chrome on Android), otherwise ZXing on a cropped, downscaled frame.
import { BinaryBitmap, HybridBinarizer, NotFoundException, QRCodeReader, RGBLuminanceSource } from "@zxing/library";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (opts: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

export async function createDecoder() {
  const BD = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (BD) {
    try {
      const formats = (await BD.getSupportedFormats?.()) ?? ["qr_code"];
      if (formats.includes("qr_code")) {
        const detector = new BD({ formats: ["qr_code"] });
        return {
          kind: "native" as const,
          async decode(video: HTMLVideoElement) {
            const found = await detector.detect(video);
            return found[0]?.rawValue ?? null;
          },
        };
      }
    } catch {
      /* fall back to ZXing */
    }
  }

  const reader = new QRCodeReader();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let lum = new Uint8ClampedArray(0);
  return {
    kind: "zxing" as const,
    async decode(video: HTMLVideoElement) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return null;
      // Centre square (where the guide box is), scaled down for speed.
      const side = Math.floor(Math.min(vw, vh) * 0.85);
      const out = Math.min(side, 640);
      canvas.width = out;
      canvas.height = out;
      ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, out, out);
      const { data } = ctx.getImageData(0, 0, out, out);
      if (lum.length !== out * out) lum = new Uint8ClampedArray(out * out);
      for (let i = 0, j = 0; j < lum.length; i += 4, j++) lum[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      try {
        return reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, out, out)))).getText();
      } catch (e) {
        if (!(e instanceof NotFoundException)) {
          /* checksum/format errors: just try the next frame */
        }
        return null;
      } finally {
        reader.reset();
      }
    },
  };
}
