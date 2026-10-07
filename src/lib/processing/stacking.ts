// AstroSnap – képfeldolgozó eszközök: stacking, zajredukció, színkorrekció
// Minden kliens-oldali, Canvas/ImageData alapú feldolgozás.

import type {
  ColorSettings,
  StackOptions,
  StoredImage,
} from "@/lib/astro/types";

// ----- Kép betöltés Blob-ból HTMLImageElement-ként -----
export async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Kép betöltése sikertelen"));
      img.src = url;
    });
    return img;
  } finally {
    // Az URL-t csak a kép dekódolása után szabad felszabadítani
    // A hívó felelős a használatért
  }
}

// ----- ImageData kinyerése egy HTMLImageElement-ből -----
export function imageToImageData(
  img: HTMLImageElement,
  maxDim?: number
): ImageData {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (maxDim && Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// ----- ImageData → Blob (PNG) -----
export function imageDataToBlob(data: ImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(data, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob sikertelen"))),
      "image/png",
      0.95
    );
  });
}

// ----- ImageData → Thumbnail Blob -----
export async function imageDataToThumbnail(
  data: ImageData,
  maxDim = 200
): Promise<Blob> {
  const scale = Math.min(1, maxDim / Math.max(data.width, data.height));
  const w = Math.max(1, Math.round(data.width * scale));
  const h = Math.max(1, Math.round(data.height * scale));
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = data.width;
  srcCanvas.height = data.height;
  srcCanvas.getContext("2d")!.putImageData(data, 0, 0);
  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = w;
  dstCanvas.height = h;
  const dstCtx = dstCanvas.getContext("2d")!;
  dstCtx.drawImage(srcCanvas, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    dstCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("thumbnail toBlob sikertelen"))),
      "image/jpeg",
      0.7
    );
  });
}

// ----- Pixel előjel nélküli 0-1 tartományba normalizálása -----
function norm(val: number, max = 255): number {
  return Math.max(0, Math.min(1, val / max));
}

function denorm(val: number, max = 255): number {
  return Math.max(0, Math.min(max, Math.round(val * max)));
}

// ----- Színkorrekció egyetlen képre -----
// A ColorSettings -100..+100 skálákon dolgozik, amit belsőleg átalakítunk.
export function applyColorCorrection(
  src: ImageData,
  cs: ColorSettings
): ImageData {
  const out = new ImageData(
    new Uint8ClampedArray(src.data),
    src.width,
    src.height
  );
  const data = out.data;
  const n = data.length;

  // Először: auto levels (ha kérték)
  let blackLevel = 0;
  let whiteLevel = 255;
  if (cs.autoLevels) {
    // Hisztogram alapú 0.5% és 99.5% percentilis
    const histR = new Array(256).fill(0);
    const histG = new Array(256).fill(0);
    const histB = new Array(256).fill(0);
    for (let i = 0; i < n; i += 4) {
      histR[data[i]]++;
      histG[data[i + 1]]++;
      histB[data[i + 2]]++;
    }
    const total = n / 4;
    const loThresh = total * 0.005;
    const hiThresh = total * 0.995;
    const findPercentile = (
      hist: number[],
      lo: boolean
    ): number => {
      let acc = 0;
      for (let i = 0; i < 256; i++) {
        acc += hist[i];
        if (lo && acc >= loThresh) return i;
        if (!lo && acc >= hiThresh) return i;
      }
      return lo ? 0 : 255;
    };
    const blackR = findPercentile(histR, true);
    const blackG = findPercentile(histG, true);
    const blackB = findPercentile(histB, true);
    const whiteR = findPercentile(histR, false);
    const whiteG = findPercentile(histG, false);
    const whiteB = findPercentile(histB, false);
    blackLevel = Math.min(blackR, blackG, blackB);
    whiteLevel = Math.max(whiteR, whiteG, whiteB);
    if (whiteLevel - blackLevel < 50) {
      whiteLevel = Math.min(255, blackLevel + 50);
    }
  } else {
    // Manuális black/white point (csak a beállított értékek hatnak)
    blackLevel = (cs.blackPoint / 100) * 255;
    whiteLevel = (cs.whitePoint / 100) * 255;
  }

  // Fehérmérleg eltolás (temperature & tint)
  // temperature: -100 → hidegebb (kék), +100 → melegebb (piros)
  // tint: -100 → zöld, +100 → magenta
  const tempShift = cs.temperatureK / 100; // -1..1
  const tintShift = cs.tint / 100;
  const rMult = 1 + tempShift * 0.15 + tintShift * 0.05;
  const gMult = 1 - tintShift * 0.1;
  const bMult = 1 - tempShift * 0.15 + tintShift * 0.05;

  // Expozíció EV
  const expMult = Math.pow(2, cs.exposureEv);

  // Kontraszt -100..+100 → 0.5..1.5 multiplier a közép körül
  const contrastMult = 1 + cs.contrast / 200;
  const contrastPivot = 128;

  // Highlights / shadows: lokális korrekció
  // Highlights: a 192-255 tartományban csökkentjük/növeljük
  // Shadows: a 0-64 tartományban növeljük/csökkentjük
  const highlightFactor = 1 - cs.highlights / 200; // +100 → 0.5 (csökkent), -100 → 1.5 (növel)
  const shadowFactor = 1 + cs.shadows / 200; // +100 → 1.5 (növel), -100 → 0.5

  // Saturation: 0 → 1, +100 → 2, -100 → 0
  const satMult = 1 + cs.saturation / 100;
  // Vibrance: gyengébb, csak az alulszaturált színeket erősíti
  const vibranceAmount = cs.vibrance / 100;

  // Gamma
  const gammaInv = 1 / Math.max(0.1, cs.gamma);

  // Fő ciklus
  for (let i = 0; i < n; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Fehérmérleg
    r = r * rMult;
    g = g * gMult;
    b = b * bMult;

    // 2. Fekete/Fehér pont (auto vagy manuális)
    if (whiteLevel > blackLevel) {
      const span = whiteLevel - blackLevel;
      r = ((r - blackLevel) / span) * 255;
      g = ((g - blackLevel) / span) * 255;
      b = ((b - blackLevel) / span) * 255;
    }

    // 3. Expozíció
    r *= expMult;
    g *= expMult;
    b *= expMult;

    // 4. Highlights / shadows
    if (r > 128) {
      const t = (r - 128) / 127; // 0..1
      r = r * (1 - t + t * highlightFactor);
    } else {
      const t = 1 - r / 128; // 0..1, 0-nál 0, 128-nál 1
      r = r + (r * shadowFactor - r) * t * 0.5;
    }
    if (g > 128) {
      const t = (g - 128) / 127;
      g = g * (1 - t + t * highlightFactor);
    } else {
      const t = 1 - g / 128;
      g = g + (g * shadowFactor - g) * t * 0.5;
    }
    if (b > 128) {
      const t = (b - 128) / 127;
      b = b * (1 - t + t * highlightFactor);
    } else {
      const t = 1 - b / 128;
      b = b + (b * shadowFactor - b) * t * 0.5;
    }

    // 5. Kontraszt
    r = contrastPivot + (r - contrastPivot) * contrastMult;
    g = contrastPivot + (g - contrastPivot) * contrastMult;
    b = contrastPivot + (b - contrastPivot) * contrastMult;

    // 6. Gamma
    r = 255 * Math.pow(norm(r), gammaInv);
    g = 255 * Math.pow(norm(g), gammaInv);
    b = 255 * Math.pow(norm(b), gammaInv);

    // 7. Saturation & vibrance
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (satMult !== 1) {
      r = lum + (r - lum) * satMult;
      g = lum + (g - lum) * satMult;
      b = lum + (b - lum) * satMult;
    }
    if (vibranceAmount !== 0) {
      const sat = Math.max(
        0,
        1 - Math.min(r, g, b) / Math.max(r, g, b, 1)
      );
      const vibFactor = vibranceAmount * (1 - sat);
      r = lum + (r - lum) * (1 + vibFactor);
      g = lum + (g - lum) * (1 + vibFactor);
      b = lum + (b - lum) * (1 + vibFactor);
    }

    // 8. Clamp
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  return out;
}

// ----- Kereszt-korreláció eltolás kereséséhez (egyszerű brute force) -----
// Két 1-csatornás (gray) Float32Array-on maximalizálja a korrelációt
// egy megadott eltolási tartományon belül.
// Minden pixelt nézünk (nem csak minden 2.-at) a pontosabb alignment érdekében.
function findBestShift(
  a: Float32Array,
  b: Float32Array,
  w: number,
  h: number,
  range = 30
): { dx: number; dy: number } {
  let bestDx = 0;
  let bestDy = 0;
  let bestCorr = -Infinity;

  // Normalizált kereszt-korreláció (NCC) - sokkal pontosabb mint az egyszerű szorzat
  // Először kiszámoljuk az átlagokat
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < a.length; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / a.length;
  const meanB = sumB / b.length;

  // Szórások
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < a.length; i++) {
    varA += (a[i] - meanA) * (a[i] - meanA);
    varB += (b[i] - meanB) * (b[i] - meanB);
  }
  const stdA = Math.sqrt(varA / a.length);
  const stdB = Math.sqrt(varB / b.length);
  if (stdA === 0 || stdB === 0) {
    return { dx: 0, dy: 0 };
  }

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      let sumNCC = 0;
      let count = 0;
      const yStart = Math.max(0, -dy);
      const yEnd = Math.min(h, h - dy);
      const xStart = Math.max(0, -dx);
      const xEnd = Math.min(w, w - dx);
      // Minden pixelt nézünk a pontosabb alignment érdekében
      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          const ia = y * w + x;
          const ib = (y + dy) * w + (x + dx);
          // Normalizált kereszt-korreláció
          sumNCC += ((a[ia] - meanA) / stdA) * ((b[ib] - meanB) / stdB);
          count++;
        }
      }
      const corr = sumNCC / count;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }
  return { dx: bestDx, dy: bestDy };
}

// ----- Képből szürke Float32Array -----
function toGrayscale(img: ImageData): Float32Array {
  const { data, width, height } = img;
  const out = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    out[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

// ----- Kép eltolása -----
function shiftImage(
  img: ImageData,
  dx: number,
  dy: number
): ImageData {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
        const dst = (y * width + x) * 4;
        const src = (sy * width + sx) * 4;
        out[dst] = data[src];
        out[dst + 1] = data[src + 1];
        out[dst + 2] = data[src + 2];
        out[dst + 3] = data[src + 3];
      } else {
        const dst = (y * width + x) * 4;
        out[dst + 3] = 0;
      }
    }
  }
  return new ImageData(out, width, height);
}

// ----- Kép forgatása (bicubic helyett bilineáris a sebesség kedvéért) -----
function rotateImage(img: ImageData, deg: number): ImageData {
  if (Math.abs(deg) < 0.01) return img;
  const { width, height, data } = img;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Új dimenziók: forgatás után a befoglaló téglalap
  const newW = Math.ceil(Math.abs(width * cos) + Math.abs(height * sin));
  const newH = Math.ceil(Math.abs(width * sin) + Math.abs(height * cos));
  const out = new Uint8ClampedArray(newW * newH * 4);
  const cx = newW / 2;
  const cy = newH / 2;
  const ocx = width / 2;
  const ocy = height / 2;

  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      // Inverz transzformáció: cél → forrás
      const dx = x - cx;
      const dy = y - cy;
      const sx = cos * dx + sin * dy + ocx;
      const sy = -sin * dx + cos * dy + ocy;
      const dstIdx = (y * newW + x) * 4;
      if (sx >= 0 && sx < width - 1 && sy >= 0 && sy < height - 1) {
        // Bilineáris mintavételezés
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const fx = sx - x0;
        const fy = sy - y0;
        for (let c = 0; c < 4; c++) {
          const tl = data[(y0 * width + x0) * 4 + c];
          const tr = data[(y0 * width + x1) * 4 + c];
          const bl = data[(y1 * width + x0) * 4 + c];
          const br = data[(y1 * width + x1) * 4 + c];
          const top = tl * (1 - fx) + tr * fx;
          const bot = bl * (1 - fx) + br * fx;
          out[dstIdx + c] = top * (1 - fy) + bot * fy;
        }
      } else {
        out[dstIdx + 3] = 0;
      }
    }
  }
  return new ImageData(out, newW, newH);
}

// ----- Vágás a metszetre (több kép align után) -----
function cropToIntersection(
  images: ImageData[]
): ImageData[] {
  if (images.length === 0) return images;
  // Minden képnek azonosnak kell lennie méretben (a forgatás/különbség miatt nem biztos)
  // Egyszerűsítés: a legkisebb közös területre vágunk.
  const minW = Math.min(...images.map((i) => i.width));
  const minH = Math.min(...images.map((i) => i.height));
  return images.map((img) => {
    if (img.width === minW && img.height === minH) return img;
    const canvas = document.createElement("canvas");
    canvas.width = minW;
    canvas.height = minH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // ImageData → canvas közvetlenül nem megy, tesszük át
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = img.width;
    tmpCanvas.height = img.height;
    tmpCanvas.getContext("2d")!.putImageData(img, 0, 0);
    ctx.drawImage(tmpCanvas, 0, 0, minW, minH);
    return ctx.getImageData(0, 0, minW, minH);
  });
}

// ----- Stackelés (fő függvény) -----
// Bemenet: feldolgozandó képek ImageData-ként, opciók, és referencia képek (dark, flat, bias)
export interface StackInput {
  lights: ImageData[];
  dark?: ImageData;
  flat?: ImageData;
  bias?: ImageData;
  options: StackOptions;
  onProgress?: (progress: number, message: string) => void;
}

export async function stackImages(input: StackInput): Promise<ImageData> {
  const { lights, options, onProgress } = input;
  if (lights.length === 0) {
    throw new Error("Nincs kép az egybeillesztéshez");
  }

  onProgress?.(0, "Képek előkészítése...");

  // 1. Dark frame kivonás minden light frame-ből
  let processedLights = lights;
  if (input.dark && options.useDarkFrame) {
    onProgress?.(0.1, "Sötét frame kivonása...");
    processedLights = lights.map((light, i) => {
      onProgress?.(
        0.1 + (i / lights.length) * 0.15,
        `Sötét frame: ${i + 1}/${lights.length}`
      );
      return subtractDarkFrame(light, input.dark!);
    });
  }

  // 2. Flat field korrekció
  if (input.flat && options.useFlatFrame) {
    onProgress?.(0.25, "Flat field korrekció...");
    const flatToUse = input.bias && options.useBiasFrame
      ? subtractDarkFrame(input.flat, input.bias)
      : input.flat;
    processedLights = processedLights.map((light, i) => {
      onProgress?.(
        0.25 + (i / lights.length) * 0.1,
        `Flat korrekció: ${i + 1}/${lights.length}`
      );
      return applyFlatCorrection(light, flatToUse);
    });
  }

  // 3. Igazítás (align)
  if (options.alignImages && processedLights.length > 1) {
    onProgress?.(0.4, "Képek igazítása...");
    const ref = processedLights[0];
    const refGray = toGrayscale(downscaleForAlignment(ref));
    const alignedLights: ImageData[] = [ref];

    for (let i = 1; i < processedLights.length; i++) {
      onProgress?.(
        0.4 + (i / lights.length) * 0.2,
        `Igazítás: ${i + 1}/${lights.length}`
      );
      const cur = processedLights[i];
      const curGray = toGrayscale(downscaleForAlignment(cur));
      const ds = Math.sqrt(refGray.length) | 0;
      const { dx, dy } = findBestShift(refGray, curGray, ds, ds, 40);
      const scaledDx = Math.round(dx * (ref.width / ds));
      const scaledDy = Math.round(dy * (ref.height / ds));
      alignedLights.push(shiftImage(cur, scaledDx, scaledDy));
    }
    processedLights = alignedLights;
  }

  // 4. Manuális forgatás az összes képre
  if (Math.abs(options.manualRotationDeg) > 0.01) {
    onProgress?.(0.65, "Forgatás alkalmazása...");
    // Csak az első képet forgatjuk referenciaként - vagy az összeset?
    // A felhasználó által beállított forgatás: minden képre alkalmazzuk
    processedLights = processedLights.map((img) =>
      rotateImage(img, options.manualRotationDeg)
    );
  }

  // 5. Vágás a közös metszetre
  processedLights = cropToIntersection(processedLights);

  // 6. Stackelés: average / median / sigma_clip
  onProgress?.(0.7, `Képek egyesítése (${options.method})...`);
  const result = combineImages(processedLights, options.method, (p, msg) =>
    onProgress?.(0.7 + p * 0.3, msg)
  );

  onProgress?.(1, "Kész!");
  return result;
}

// ----- Dark frame kivonás -----
function subtractDarkFrame(light: ImageData, dark: ImageData): ImageData {
  // Ha mérete különbözik, a dark frame-et átméretezzük
  let darkData = dark;
  if (dark.width !== light.width || dark.height !== light.height) {
    darkData = resizeImageData(dark, light.width, light.height);
  }
  const out = new ImageData(
    new Uint8ClampedArray(light.data),
    light.width,
    light.height
  );
  const outData = out.data;
  const darkDataArr = darkData.data;
  for (let i = 0; i < outData.length; i += 4) {
    outData[i] = Math.max(0, outData[i] - darkDataArr[i] * 0.8);
    outData[i + 1] = Math.max(0, outData[i + 1] - darkDataArr[i + 1] * 0.8);
    outData[i + 2] = Math.max(0, outData[i + 2] - darkDataArr[i + 2] * 0.8);
  }
  return out;
}

// ----- Flat field correction -----
function applyFlatCorrection(light: ImageData, flat: ImageData): ImageData {
  let flatData = flat;
  if (flat.width !== light.width || flat.height !== light.height) {
    flatData = resizeImageData(flat, light.width, light.height);
  }
  // Átlag kiszámítása a flat frame-ből (normalizáláshoz)
  const flatArr = flatData.data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < flatArr.length; i += 4) {
    const v = (flatArr[i] + flatArr[i + 1] + flatArr[i + 2]) / 3;
    sum += v;
    count++;
  }
  const mean = sum / count || 1;

  const out = new ImageData(
    new Uint8ClampedArray(light.data),
    light.width,
    light.height
  );
  const outData = out.data;
  for (let i = 0; i < outData.length; i += 4) {
    const fR = flatArr[i] / mean || 1;
    const fG = flatArr[i + 1] / mean || 1;
    const fB = flatArr[i + 2] / mean || 1;
    outData[i] = Math.max(0, Math.min(255, outData[i] / fR));
    outData[i + 1] = Math.max(0, Math.min(255, outData[i + 1] / fG));
    outData[i + 2] = Math.max(0, Math.min(255, outData[i + 2] / fB));
  }
  return out;
}

// ----- ImageData átméretezése -----
function resizeImageData(
  src: ImageData,
  newW: number,
  newH: number
): ImageData {
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = src.width;
  srcCanvas.height = src.height;
  srcCanvas.getContext("2d")!.putImageData(src, 0, 0);
  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = newW;
  dstCanvas.height = newH;
  dstCanvas.getContext("2d")!.drawImage(srcCanvas, 0, 0, newW, newH);
  return dstCanvas.getContext("2d")!.getImageData(0, 0, newW, newH);
}

// ----- Kép lecsökkentése alignment-hez (gyorsabb korreláció) -----
function downscaleForAlignment(img: ImageData): ImageData {
  // 512-re növeljük (korábban 256 volt) a pontosabb alignment érdekében
  const maxDim = 512;
  if (Math.max(img.width, img.height) <= maxDim) return img;
  const scale = maxDim / Math.max(img.width, img.height);
  return resizeImageData(img, Math.round(img.width * scale), Math.round(img.height * scale));
}

// ----- Több kép kombinálása egyetlen képpé -----
function combineImages(
  images: ImageData[],
  method: "average" | "median" | "sigma_clip",
  onProgress?: (p: number, msg: string) => void
): ImageData {
  if (images.length === 1) return images[0];
  const w = images[0].width;
  const h = images[0].height;
  const out = new ImageData(w, h);
  const outData = out.data;
  const n = images.length;
  const total = w * h;

  if (method === "average") {
    const accum = new Float64Array(w * h * 3);
    for (let k = 0; k < n; k++) {
      const d = images[k].data;
      for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
        accum[j] += d[i];
        accum[j + 1] += d[i + 1];
        accum[j + 2] += d[i + 2];
      }
      if (onProgress && (k % 5 === 0 || k === n - 1)) {
        onProgress(k / n, `Átlagolás: ${k + 1}/${n}`);
      }
    }
    for (let i = 0, j = 0; i < outData.length; i += 4, j += 3) {
      outData[i] = accum[j] / n;
      outData[i + 1] = accum[j + 1] / n;
      outData[i + 2] = accum[j + 2] / n;
      outData[i + 3] = 255;
    }
  } else if (method === "median") {
    // Pixelenkénti medián
    const rArr = new Float32Array(n);
    const gArr = new Float32Array(n);
    const bArr = new Float32Array(n);
    for (let p = 0; p < total; p++) {
      for (let k = 0; k < n; k++) {
        const idx = (p * 4) | 0;
        const src = images[k].data;
        rArr[k] = src[idx];
        gArr[k] = src[idx + 1];
        bArr[k] = src[idx + 2];
      }
      rArr.sort();
      gArr.sort();
      bArr.sort();
      const mid = n >> 1;
      const idx = (p * 4) | 0;
      outData[idx] = n % 2 === 0 ? (rArr[mid - 1] + rArr[mid]) / 2 : rArr[mid];
      outData[idx + 1] =
        n % 2 === 0 ? (gArr[mid - 1] + gArr[mid]) / 2 : gArr[mid];
      outData[idx + 2] =
        n % 2 === 0 ? (bArr[mid - 1] + bArr[mid]) / 2 : bArr[mid];
      outData[idx + 3] = 255;
      if (onProgress && p % 5000 === 0) {
        onProgress(p / total, `Medián: ${p}/${total}`);
      }
    }
  } else if (method === "sigma_clip") {
    // Sigma-clipped átlag: kiszórja az outlier pixeleket
    const accum = new Float64Array(w * h * 3);
    const countArr = new Int32Array(w * h);
    for (let k = 0; k < n; k++) {
      const d = images[k].data;
      // Első kör: számold a statisztikát
      // Egyszerűsítés: a teljes kép statisztikája alapján vágunk
      if (onProgress) onProgress(k / (n * 2), `Sigma clip: ${k + 1}/${n}`);
    }
    // Második kör: számoljuk az átlagot és szórást pixelenként
    const mean = new Float32Array(total * 3);
    for (let k = 0; k < n; k++) {
      const d = images[k].data;
      for (let p = 0; p < total; p++) {
        mean[p * 3] += d[p * 4];
        mean[p * 3 + 1] += d[p * 4 + 1];
        mean[p * 3 + 2] += d[p * 4 + 2];
      }
      if (onProgress) onProgress(0.3 + k / n * 0.3, `Átlag: ${k + 1}/${n}`);
    }
    for (let p = 0; p < total; p++) {
      mean[p * 3] /= n;
      mean[p * 3 + 1] /= n;
      mean[p * 3 + 2] /= n;
    }
    // Szórás
    const sigma = new Float32Array(total * 3);
    for (let k = 0; k < n; k++) {
      const d = images[k].data;
      for (let p = 0; p < total; p++) {
        const dr = d[p * 4] - mean[p * 3];
        const dg = d[p * 4 + 1] - mean[p * 3 + 1];
        const db = d[p * 4 + 2] - mean[p * 3 + 2];
        sigma[p * 3] += dr * dr;
        sigma[p * 3 + 1] += dg * dg;
        sigma[p * 3 + 2] += db * db;
      }
      if (onProgress) onProgress(0.6 + k / n * 0.2, `Szórás: ${k + 1}/${n}`);
    }
    for (let p = 0; p < total; p++) {
      sigma[p * 3] = Math.sqrt(sigma[p * 3] / n);
      sigma[p * 3 + 1] = Math.sqrt(sigma[p * 3 + 1] / n);
      sigma[p * 3 + 2] = Math.sqrt(sigma[p * 3 + 2] / n);
    }
    // Harmadik kör: csak a 2σ-n belüli értékeket átlagoljuk
    for (let k = 0; k < n; k++) {
      const d = images[k].data;
      for (let p = 0; p < total; p++) {
        const dr = Math.abs(d[p * 4] - mean[p * 3]);
        const dg = Math.abs(d[p * 4 + 1] - mean[p * 3 + 1]);
        const db = Math.abs(d[p * 4 + 2] - mean[p * 3 + 2]);
        if (dr < 2 * (sigma[p * 3] + 1)) {
          accum[p * 3] += d[p * 4];
          countArr[p] |= 1;
        }
        if (dg < 2 * (sigma[p * 3 + 1] + 1)) {
          accum[p * 3 + 1] += d[p * 4 + 1];
        }
        if (db < 2 * (sigma[p * 3 + 2] + 1)) {
          accum[p * 3 + 2] += d[p * 4 + 2];
        }
      }
      if (onProgress) onProgress(0.8 + k / n * 0.2, `Szűrés: ${k + 1}/${n}`);
    }
    for (let p = 0; p < total; p++) {
      outData[p * 4] = accum[p * 3] / n;
      outData[p * 4 + 1] = accum[p * 3 + 1] / n;
      outData[p * 4 + 2] = accum[p * 3 + 2] / n;
      outData[p * 4 + 3] = 255;
    }
  }

  return out;
}

// ----- Több StoredImage betöltése ImageData-vá -----
export async function loadStoredImagesAsImageData(
  images: StoredImage[],
  maxDim?: number,
  onProgress?: (p: number, msg: string) => void
): Promise<ImageData[]> {
  const out: ImageData[] = [];
  for (let i = 0; i < images.length; i++) {
    onProgress?.(i / images.length, `Kép betöltése: ${i + 1}/${images.length}`);
    const img = await loadImageFromBlob(images[i].blob);
    out.push(imageToImageData(img, maxDim));
  }
  return out;
}
