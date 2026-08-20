/**
 * Captura de pantalla de la Android TV vía ADB y la prepara para el LLM de visión.
 * - captureScreenPng(): PNG original (1280x720).
 * - captureScreenForVision(): JPEG base64 reducido (maxWidth) para el modelo.
 */

import { execFileSync } from 'child_process';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const ADB_PATH = process.env.ADB_PATH || 'C:/Users/gomit/Android/Sdk/platform-tools/adb.exe';
const TV_ADDRESS = process.env.TV_ADDRESS || '192.168.1.95:5555';

function adbArgs(extra: string[]): string[] {
  return ['-s', TV_ADDRESS, ...extra];
}

export function adbAvailable(): boolean {
  try {
    execFileSync(ADB_PATH, ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function adbConnect(): void {
  try {
    execFileSync(ADB_PATH, ['connect', TV_ADDRESS], { stdio: 'pipe' });
  } catch {
    /* noop */
  }
}

/** Captura la pantalla completa en PNG. */
export function captureScreenPng(): Buffer {
  const raw = execFileSync(ADB_PATH, adbArgs(['exec-out', 'screencap', '-p']), {
    maxBuffer: 20 * 1024 * 1024,
  });
  // La TV puede anteponer logs ('Init wrapper...') y anexar bytes tras IEND.
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const start = raw.indexOf(sig);
  if (start < 0) return raw;
  const iend = raw.lastIndexOf(Buffer.from('IEND'));
  return iend >= 0 ? raw.subarray(start, iend + 8) : raw.subarray(start);
}

export interface VisionImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Redimensiona el PNG a maxWidth (manteniendo aspect ratio) y lo codifica en JPEG base64.
 */
export function resizePngToJpeg(pngBuffer: Buffer, maxWidth: number): VisionImage {
  const png = PNG.sync.read(pngBuffer);
  const scale = Math.min(1, maxWidth / png.width);
  const w = Math.max(1, Math.round(png.width * scale));
  const h = Math.max(1, Math.round(png.height * scale));

  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const srcY = Math.min(png.height - 1, Math.round(y / scale));
    for (let x = 0; x < w; x++) {
      const srcX = Math.min(png.width - 1, Math.round(x / scale));
      const si = (srcY * png.width + srcX) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }

  const jpegBuf = jpeg.encode(
    {
      data: Buffer.from(out.data),
      width: w,
      height: h,
    },
    85,
  );
  return {
    dataUrl: `data:image/jpeg;base64,${jpegBuf.data.toString('base64')}`,
    width: w,
    height: h,
    bytes: jpegBuf.data.length,
  };
}

/** Captura la pantalla y la devuelve lista para el LLM de visión. */
export function captureScreenForVision(maxWidth = 480): VisionImage {
  const png = captureScreenPng();
  return resizePngToJpeg(png, maxWidth);
}