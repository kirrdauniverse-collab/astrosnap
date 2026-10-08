// RAW fájl dekódoló modul
// DNG (Digital Negative) formátumú RAW fájlok betöltése böngészőben.
// A DNG formátum technikailag TIFF alapú, így a UTIF.js könyvtár tudja dekódolni.
// A legtöbb Android telefon és sok DSLR DNG formátumban menti a RAW fájlokat.
//
// Megjegyzés: más RAW formátumok (CR2, NEF, ARW stb.) nem támogatottak böngészőben,
// mert a libraw-wasm könyvtár nem kompatibilis a Next.js 16 Turbopack-kal.
// A felhasználónak DNG-vé kell konvertálnia az Adobe DNG Converter-rel (ingyenes).

import UTIF from "utif";

// Támogatott RAW formátumok kiterjesztései (amiket tudunk dekódolni)
export const SUPPORTED_RAW_EXTENSIONS = [".dng", ".tiff", ".tif"] as const;

// Nem támogatott RAW formátumok (CR2, NEF, ARW stb.)
export const UNSUPPORTED_RAW_EXTENSIONS = [
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".raf",
  ".orf",
  ".rw2",
  ".pef",
  ".srw",
  ".raw",
] as const;

/**
 * Ellenőrzi, hogy a fájl DNG formátumú-e (amit a UTIF.js tud dekódolni).
 */
export function isDngFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".dng") || lower.endsWith(".tiff") || lower.endsWith(".tif");
}

/**
 * Ellenőrzi, hogy a fájl egyéb (nem DNG) RAW formátumú-e, amit nem tudunk dekódolni.
 */
export function isOtherRawFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return UNSUPPORTED_RAW_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Ellenőrzi, hogy a fájl bármilyen RAW formátumú-e.
 */
export function isRawFile(fileName: string): boolean {
  return isDngFile(fileName) || isOtherRawFile(fileName);
}

/**
 * Ellenőrzi, hogy a fájl BMP formátumú-e.
 */
export function isBmpFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".bmp");
}

/**
 * Ellenőrzi, hogy a fájl TIFF formátumú-e.
 */
export function isTiffFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".tiff") || lower.endsWith(".tif");
}

/**
 * DNG/TIFF fájl dekódolása ImageData-vá a UTIF.js segítségével.
 *
 * @param blob A DNG fájl Blob formájában
 * @param maxDim Maximális dimenzió (ha a kép nagyobb, lekicsinyítjük). Alapértelmezett: 4096
 * @returns ImageData a dekódolt képpel
 */
export async function decodeDngToImageData(
  blob: Blob,
  maxDim = 4096
): Promise<ImageData> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const ifds = UTIF.decode(bytes);
  if (!ifds || ifds.length === 0) {
    throw new Error("Nem sikerült dekódolni a DNG fájlt - érvénytelen formátum");
  }

  const primaryIfd = ifds[0];
  UTIF.decodeImage(bytes, primaryIfd, ifds);

  const rgba = UTIF.toRGBA8(primaryIfd);
  const width = primaryIfd.width;
  const height = primaryIfd.height;

  if (!width || !height) {
    throw new Error("Nem sikerült lekérni a kép méreteit a DNG fájlból");
  }

  const fullData = new Uint8ClampedArray(rgba);

  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    const finalW = Math.round(width * scale);
    const finalH = Math.round(height * scale);

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = width;
    srcCanvas.height = height;
    const srcCtx = srcCanvas.getContext("2d")!;
    const srcImageData = new ImageData(fullData, width, height);
    srcCtx.putImageData(srcImageData, 0, 0);

    const dstCanvas = document.createElement("canvas");
    dstCanvas.width = finalW;
    dstCanvas.height = finalH;
    const dstCtx = dstCanvas.getContext("2d", { willReadFrequently: true })!;
    dstCtx.drawImage(srcCanvas, 0, 0, finalW, finalH);

    return dstCtx.getImageData(0, 0, finalW, finalH);
  }

  return new ImageData(fullData, width, height);
}

/**
 * BMP fájl betöltése ImageData-vá.
 */
export async function decodeBmpToImageData(
  blob: Blob,
  maxDim = 4096
): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  const w = bitmap.width;
  const h = bitmap.height;

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const finalW = Math.round(w * scale);
  const finalH = Math.round(h * scale);
  canvas.width = finalW;
  canvas.height = finalH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, finalW, finalH);
  bitmap.close();

  return ctx.getImageData(0, 0, finalW, finalH);
}

/**
 * Univerzális kép/RAW dekódoló.
 * DNG, TIFF, BMP, JPEG, PNG, WEBP, HEIC fájlokat tud dekódolni.
 *
 * Megjegyzés: CR2, NEF, ARW és egyéb zárt RAW formátumok NEM támogatottak.
 * Ezeket a felhasználónak DNG-vé kell konvertálnia (Adobe DNG Converter, ingyenes).
 *
 * @param blob A fájl Blob formájában
 * @param fileName A fájl neve (kiterjesztés alapján felismeri a típust)
 * @param maxDim Maximális dimenzió (alapértelmezett: 4096)
 * @returns ImageData a dekódolt képpel
 */
export async function decodeImageFile(
  blob: Blob,
  fileName: string,
  maxDim = 4096
): Promise<ImageData> {
  const lowerName = fileName.toLowerCase();

  // DNG vagy TIFF fájl
  if (isDngFile(lowerName)) {
    return await decodeDngToImageData(blob, maxDim);
  }

  // BMP fájl
  if (isBmpFile(lowerName)) {
    return await decodeBmpToImageData(blob, maxDim);
  }

  // Normál képformátumok (JPEG, PNG, WEBP, HEIC, GIF)
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  const w = bitmap.width;
  const h = bitmap.height;

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const finalW = Math.round(w * scale);
  const finalH = Math.round(h * scale);
  canvas.width = finalW;
  canvas.height = finalH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, finalW, finalH);
  bitmap.close();

  return ctx.getImageData(0, 0, finalW, finalH);
}

/**
 * Ellenőrzi, hogy a fájl típusát dekódolni tudjuk-e.
 */
export function isSupportedFormat(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (isDngFile(lower)) return true;
  if (isBmpFile(lower)) return true;
  if (isOtherRawFile(lower)) return false;
  return true;
}

/**
 * Visszaadja a fájl formátumát olvasható formában.
 */
export function getFileFormat(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".dng")) return "DNG (RAW)";
  if (lower.endsWith(".tiff") || lower.endsWith(".tif")) return "TIFF";
  if (isBmpFile(lower)) return "BMP";
  if (isOtherRawFile(lower)) {
    const ext = lower.split(".").pop()?.toUpperCase();
    return `${ext} (Nem támogatott RAW)`;
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "JPEG";
  if (lower.endsWith(".png")) return "PNG";
  if (lower.endsWith(".webp")) return "WebP";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "HEIC";
  if (lower.endsWith(".gif")) return "GIF";
  return "Ismeretlen";
}
