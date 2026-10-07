// RAW fájl dekódoló modul
// DNG (Digital Negative) formátumú RAW fájlok betöltése böngészőben.
// A DNG formátum technikailag TIFF alapú, így a UTIF.js könyvtár tudja dekódolni.
// A legtöbb Android telefon és sok DSLR DNG formátumban menti a RAW fájlokat.
//
// Más RAW formátumok (CR2, NEF, ARW stb.) nem támogatottak - ezekhez
// libraw-wasm kellene (túl nagy ~3MB), így a felhasználónak DNG-vé kell konvertálnia.

import UTIF from "utif";

// Támogatott RAW formátumok kiterjesztései
export const SUPPORTED_RAW_EXTENSIONS = [".dng"] as const;
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
  return lower.endsWith(".dng");
}

/**
 * Ellenőrzi, hogy a fájl egyéb (nem DNG) RAW formátumú-e, amit nem tudunk dekódolni.
 */
export function isOtherRawFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return UNSUPPORTED_RAW_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Ellenőrzi, hogy a fájl BMP formátumú-e.
 * A BMP-t a createImageBitmap tudja betölteni natívan, de néha explicit kezelni kell.
 */
export function isBmpFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".bmp");
}

/**
 * DNG fájl dekódolása ImageData-vá.
 * A UTIF.js visszaadja a dekódolt pixeleket RGB formátumban.
 *
 * @param blob A DNG fájl Blob formájában
 * @param maxDim Maximális dimenzió (ha a kép nagyobb, lekicsinyítjük). Alapértelmezett: 4096
 * @returns ImageData a dekódolt képpel
 */
export async function decodeDngToImageData(
  blob: Blob,
  maxDim = 4096
): Promise<ImageData> {
  // 1. Blob → ArrayBuffer
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // 2. UTIF.js dekódolás
  // A UTIF.decode visszaadja az IFD-ket (Image File Directories)
  const ifds = UTIF.decode(bytes);
  if (!ifds || ifds.length === 0) {
    throw new Error("Nem sikerült dekódolni a DNG fájlt - érvénytelen formátum");
  }

  // Az első IFD-t használjuk (a DNG általában egy képet tartalmaz)
  const primaryIfd = ifds[0];

  // Dekódoljuk a képet az IFD-ből (pixelek kinyerése)
  UTIF.decodeImage(bytes, primaryIfd, ifds);

  // A dekódolt kép adatai
  const rgba = UTIF.toRGBA8(primaryIfd);

  // A kép méretei az IFD-ből
  const width = primaryIfd.width;
  const height = primaryIfd.height;

  if (!width || !height) {
    throw new Error("Nem sikerült lekérni a kép méreteit a DNG fájlból");
  }

  // 3. ImageData létrehozása
  const fullData = new Uint8ClampedArray(rgba);
  let finalW = width;
  let finalH = height;

  // 4. Ha a kép túl nagy, lekicsinyítjük (maxDim-re)
  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    finalW = Math.round(width * scale);
    finalH = Math.round(height * scale);

    // Canvas scaling
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
 * A legtöbb böngésző a createImageBitmap-pel tudja olvasni a BMP-t,
 * de ha az nem működik, ez a fallback.
 */
export async function decodeBmpToImageData(
  blob: Blob,
  maxDim = 4096
): Promise<ImageData> {
  // A createImageBitmap tudja a BMP-t natívan
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
 * Automatikusan felismeri a fájl típusát és a megfelelő dekódert használja.
 *
 * Támogatott formátumok:
 *  - DNG (UTIF.js dekóder)
 *  - BMP (createImageBitmap)
 *  - JPEG, PNG, WEBP, GIF (createImageBitmap)
 *  - HEIC/HEIF (Safari támogatja, más böngészők nem)
 *  - TIFF (UTIF.js)
 *
 * Nem támogatott formátumok:
 *  - CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF, SRW, RAW (egyéb RAW)
 *    Ezekhez libraw-wasm kellene (túl nagy ~3MB)
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

  // DNG fájl
  if (isDngFile(lowerName) || lowerName.endsWith(".tiff") || lowerName.endsWith(".tif")) {
    return await decodeDngToImageData(blob, maxDim);
  }

  // BMP fájl
  if (isBmpFile(lowerName)) {
    return await decodeBmpToImageData(blob, maxDim);
  }

  // Egyéb képformátumok (JPEG, PNG, WEBP, HEIC, GIF)
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
  if (isDngFile(lower) || lower.endsWith(".tiff") || lower.endsWith(".tif")) {
    return true;
  }
  if (isBmpFile(lower)) return true;
  if (isOtherRawFile(lower)) return false; // Egyéb RAW nem támogatott
  // image/* formátumok (jpeg, png, webp, heic stb.) mind támogatottak
  return true;
}

/**
 * Visszaadja a fájl formátumát olvasható formában.
 */
export function getFileFormat(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (isDngFile(lower)) return "DNG (RAW)";
  if (lower.endsWith(".tiff") || lower.endsWith(".tif")) return "TIFF";
  if (isBmpFile(lower)) return "BMP";
  if (isOtherRawFile(lower)) return `${lower.split(".").pop()?.toUpperCase()} (Nem támogatott RAW)`;
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "JPEG";
  if (lower.endsWith(".png")) return "PNG";
  if (lower.endsWith(".webp")) return "WebP";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "HEIC";
  if (lower.endsWith(".gif")) return "GIF";
  return "Ismeretlen";
}
