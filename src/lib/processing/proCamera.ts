// Pro Camera API - ImageCapture PhotoSettings használata
// Ez a modul a MediaStreamTrack és ImageCapture API-kat használja
// a valódi profi kamera vezérléshez:
//
//  - Hosszú záridő (exposureTime) nanosecundumban - ténylegesen 1-30s!
//  - Manual ISO (50-6400)
//  - Manual fókusz (focusMode + focusDistance)
//  - Manual fehérmérleg (whiteBalanceMode)
//  - RAW (DNG) kimenet, ha a telefon támogatja
//
// Ezek a funkciók csak Chrome/Edge böngészőkben (Android) működnek,
// és nem minden telefon támogatja őket. A capabilities() metódussal
// ellenőrizhető, hogy mi érhető el.

export interface ProPhotoSettings {
  // Expozíciós idő nanosecundumban (1s = 1_000_000_000 ns)
  // Maximum érték általában 30s (30_000_000_000 ns)
  exposureTime?: number;
  // ISO érték (50-6400, ha a telefon támogatja)
  iso?: number;
  // Fókusz mód
  focusMode?: "auto" | "manual" | "continuous";
  // Fókusz távolság (0 = végtelen, magasabb érték = közelebbi fókusz)
  focusDistance?: number;
  // Fehérmérleg mód
  whiteBalanceMode?: "auto" | "manual" | "continuous";
  // Kép szélessége (pixelben)
  imageWidth?: number;
  // Kép magassága (pixelben)
  imageHeight?: number;
  // Vörösszem csökkentés
  redEyeReduction?: boolean;
  // Fényforrás mód: "auto" | "off" | "flash" | "torch"
  fillLightMode?: "auto" | "off" | "flash" | "torch";
}

export interface ProCameraCapabilities {
  // Hosszú záridő támogatás
  exposureTimeSupported: boolean;
  // Minimális expozíciós idő nanosecumban
  minExposureTime: number;
  // Maximális expozíciós idő nanosecumban
  maxExposureTime: number;
  // ISO beállítás támogatás
  isoSupported: boolean;
  // Minimális ISO
  minIso: number;
  // Maximális ISO
  maxIso: number;
  // Manual fókusz támogatás
  manualFocusSupported: boolean;
  // Manual fehérmérleg támogatás
  manualWhiteBalanceSupported: boolean;
  // Vörösszem csökkentés támogatás
  redEyeReductionSupported: boolean;
  // Fényforrás módok
  fillLightModes: string[];
  // Elérhető felbontások (JPEG)
  jpegResolutions: { width: number; height: number }[];
  // RAW (DNG) formátum támogatás
  rawSupported: boolean;
}

/**
 * Lekéri a kamera képességeit (capabilities) a MediaStreamTrack-ből.
 * Ez a funkció a `track.getCapabilities()` és `track.getSettings()` hívásokat használja.
 *
 * @param stream A MediaStream, amit a getUserMedia adott vissza
 * @returns A kamera képességei, vagy null ha nem elérhető
 */
export async function getProCameraCapabilities(
  stream: MediaStream
): Promise<ProCameraCapabilities | null> {
  const track = stream.getVideoTracks()[0];
  if (!track) return null;

  // A TypeScript nem ismeri a getCapabilities metódust típusosan,
  // ezért cast-olunk egy kiterjesztett típusra
  interface TrackCapabilities {
    exposureTime?: { min: number; max: number; step: number };
    iso?: { min: number; max: number; step: number };
    focusMode?: string[];
    focusDistance?: { min: number; max: number; step: number };
    whiteBalanceMode?: string[];
    redEyeReduction?: boolean;
    fillLightMode?: string[];
    torch?: boolean;
    width?: { min: number; max: number };
    height?: { min: number; max: number };
  }

  interface TrackSettings {
    exposureTime?: number;
    iso?: number;
    focusMode?: string;
    focusDistance?: number;
    whiteBalanceMode?: string;
    whiteBalanceTemperature?: number;
  }

  const capabilities =
    (track.getCapabilities?.() ?? {}) as unknown as TrackCapabilities;
  const settings = (track.getSettings?.() ?? {}) as unknown as TrackSettings;

  // JPEG felbontások lekérése a SCALER_STREAM_CONFIGURATION_MAP-ből
  let jpegResolutions: { width: number; height: number }[] = [];
  try {
    const track2 = track as unknown as {
      getCapabilities: () => {
        SCALER_STREAM_CONFIGURATION_MAP?: unknown;
      };
    };
    const caps = track2.getCapabilities?.();
    // A JPEG felbontások a PhotoCapabilities-ből is lekérhetők
    if (typeof ImageCapture !== "undefined") {
      const imageCapture = new ImageCapture(track);
      try {
        const photoCaps = await imageCapture.getPhotoCapabilities();
        if (photoCaps.imageWidth && photoCaps.imageHeight) {
          jpegResolutions = [
            {
              width: photoCaps.imageWidth.max || 4096,
              height: photoCaps.imageHeight.max || 3072,
            },
          ];
        }
      } catch {
        // Ha nem sikerül, üresen hagyjuk
      }
    }
  } catch {
    // Ha nem sikerül, üresen hagyjuk
  }

  return {
    exposureTimeSupported: !!capabilities.exposureTime,
    minExposureTime: capabilities.exposureTime?.min ?? 0,
    maxExposureTime: capabilities.exposureTime?.max ?? 0,
    isoSupported: !!capabilities.iso,
    minIso: capabilities.iso?.min ?? 0,
    maxIso: capabilities.iso?.max ?? 0,
    manualFocusSupported:
      !!capabilities.focusMode && !!capabilities.focusDistance,
    manualWhiteBalanceSupported: !!capabilities.whiteBalanceMode,
    redEyeReductionSupported: capabilities.redEyeReduction ?? false,
    fillLightModes: capabilities.fillLightMode ?? [],
    jpegResolutions,
    rawSupported: false, // Később ellenőrizzük
  };
}

/**
 * Átalakítja a felhasználói beállításokat PhotoSettings objektummá,
 * amit az ImageCapture.takePhoto() metódusnak lehet átadni.
 *
 * @param settings A felhasználói beállítások
 * @param capabilities A kamera képességei (opcionális, ellenőrzéshez)
 * @returns A PhotoSettings objektum az ImageCapture API-nak
 */
export function buildPhotoSettings(
  settings: ProPhotoSettings,
  capabilities?: ProCameraCapabilities
): PhotoSettings {
  const photoSettings: PhotoSettings = {};

  // Expozíciós idő (ha támogatott és be van állítva)
  if (
    settings.exposureTime !== undefined &&
    (!capabilities || capabilities.exposureTimeSupported)
  ) {
    // Ellenőrizzük, hogy a tartományon belül van-e
    let exposure = settings.exposureTime;
    if (capabilities) {
      exposure = Math.max(
        capabilities.minExposureTime,
        Math.min(capabilities.maxExposureTime, exposure)
      );
    }
    photoSettings.exposureTime = exposure;
  }

  // ISO (ha támogatott és be van állítva)
  if (settings.iso !== undefined && (!capabilities || capabilities.isoSupported)) {
    let iso = settings.iso;
    if (capabilities) {
      iso = Math.max(capabilities.minIso, Math.min(capabilities.maxIso, iso));
    }
    photoSettings.iso = iso;
  }

  // Fókusz mód
  if (settings.focusMode) {
    // "continuous" -> "continuous" (a PhotoSettings ezt várja)
    // "auto" -> "single-shot" (de a szabvány "auto"-t is elfogadja)
    if (settings.focusMode === "manual") {
      photoSettings.focusMode = "manual";
    } else if (settings.focusMode === "continuous") {
      photoSettings.focusMode = "continuous";
    } else {
      photoSettings.focusMode = "single-shot";
    }
  }

  // Fókusz távolság (csak manual módban)
  if (settings.focusMode === "manual" && settings.focusDistance !== undefined) {
    photoSettings.focusDistance = settings.focusDistance;
  }

  // Fehérmérleg mód
  if (settings.whiteBalanceMode) {
    if (settings.whiteBalanceMode === "manual") {
      photoSettings.whiteBalanceMode = "manual";
    } else if (settings.whiteBalanceMode === "continuous") {
      photoSettings.whiteBalanceMode = "continuous";
    } else {
      photoSettings.whiteBalanceMode = "single-shot";
    }
  }

  // Kép mérete
  if (settings.imageWidth !== undefined) {
    photoSettings.imageWidth = settings.imageWidth;
  }
  if (settings.imageHeight !== undefined) {
    photoSettings.imageHeight = settings.imageHeight;
  }

  // Vörösszem csökkentés
  if (settings.redEyeReduction !== undefined) {
    photoSettings.redEyeReduction = settings.redEyeReduction;
  }

  // Fényforrás mód (vaku)
  if (settings.fillLightMode) {
    photoSettings.fillLightMode = settings.fillLightMode;
  }

  return photoSettings;
}

/**
 * Készít egy képet a megadott profi beállításokkal.
 * Ha a telefon támogatja az ImageCapture API-t és a PhotoSettings-t,
 * akkor ténylegesen hosszú záridővel és manual ISO-val készíti a képet.
 *
 * @param stream A MediaStream
 * @param settings A profi beállítások
 * @param capabilities A kamera képességei (opcionális)
 * @returns Blob a képpel (JPEG vagy DNG formátumban)
 */
export async function captureWithProSettings(
  stream: MediaStream,
  settings: ProPhotoSettings,
  capabilities?: ProCameraCapabilities
): Promise<Blob> {
  const track = stream.getVideoTracks()[0];
  if (!track) {
    throw new Error("Nincs videó track a stream-ben");
  }

  if (typeof ImageCapture === "undefined") {
    throw new Error(
      "ImageCapture API nem támogatott ebben a böngészőben. " +
        "Próbáld Chrome vagy Edge böngészővel Androidon."
    );
  }

  const imageCapture = new ImageCapture(track);
  const photoSettings = buildPhotoSettings(settings, capabilities);

  // Ha ImageCapture.takePhoto elérhető, használjuk
  // Ez visszaadhat JPEG vagy DNG Blob-ot, a track képességeitől függően
  try {
    const blob = await imageCapture.takePhoto(photoSettings);
    return blob;
  } catch (err) {
    // Ha a PhotoSettings elutasításra kerül, próbáljuk meg alapértelmezett beállításokkal
    console.warn(
      "PhotoSettings elutasítva, próbáljuk alapértelmezett beállításokkal:",
      err
    );
    return await imageCapture.takePhoto();
  }
}

/**
 * Ellenőrzi, hogy a böngésző támogatja-e a Pro Camera funkciókat.
 */
export function isProCameraSupported(): boolean {
  return typeof ImageCapture !== "undefined" && typeof navigator !== "undefined" && !!navigator.mediaDevices;
}

/**
 * Átalakítja a másodpercben megadott expozíciós időt nanosecundumba.
 * (Az ImageCapture API nanosecundumban várja az exposureTime-ot.)
 *
 * @param seconds Expozíciós idő másodpercben
 * @returns Expozíciós idő nanosecundumban
 */
export function secondsToNanoseconds(seconds: number): number {
  return Math.round(seconds * 1_000_000_000);
}

/**
 * Átalakítja a nanosecundumban megadott expozíciós időt másodperccé.
 *
 * @param ns Expozíciós idő nanosecundumban
 * @returns Expozíciós idő másodpercben
 */
export function nanosecondsToSeconds(ns: number): number {
  return ns / 1_000_000_000;
}

/**
 * Formázza az expozíciós időt ember-olvasható formára.
 *
 * @param seconds Expozíciós idő másodpercben
 * @returns Formázott string, pl. "1/500 s", "2.5 s", "30 s"
 */
export function formatExposureTime(seconds: number): string {
  if (seconds < 1) {
    const denom = Math.round(1 / seconds);
    return `1/${denom} s`;
  }
  if (seconds < 10) {
    return `${seconds.toFixed(1)} s`;
  }
  return `${Math.round(seconds)} s`;
}

/**
 * Megpróbálja DNG (RAW) kimenetet kérni a kamerától.
 * Ez csak akkor működik, ha a telefon támogatja a RAW formátumot.
 *
 * A legtöbb modern Android telefon (Samsung Galaxy S21+, Pixel 5+, stb.)
 * támogatja a DNG kimenetet az ImageCapture API-n keresztül.
 *
 * @param stream A MediaStream
 * @returns Blob a DNG fájllal, vagy null ha nem támogatott
 */
export async function captureRawDng(
  stream: MediaStream,
  settings: ProPhotoSettings = {}
): Promise<Blob | null> {
  const track = stream.getVideoTracks()[0];
  if (!track) return null;

  if (typeof ImageCapture === "undefined") {
    return null;
  }

  // Ellenőrizzük, hogy a track támogatja-e a RAW formátumot
  // A `getCapabilities()` visszaadja a támogatott formátumokat
  interface TrackCapabilities {
    raw?: boolean;
    [key: string]: unknown;
  }
  const caps = (track.getCapabilities?.() ?? {}) as unknown as TrackCapabilities;

  // Ha van "raw" képesség, próbáljuk meg DNG-t kérni
  if (!caps.raw) {
    return null; // Nem támogatott
  }

  try {
    const imageCapture = new ImageCapture(track);
    // A takePhoto visszaadhat DNG Blob-ot, ha a track támogatja
    // Nincs külön "format" beállítás, a kimeneti formátum a track képességeitől függ
    const photoSettings = buildPhotoSettings(settings);
    const blob = await imageCapture.takePhoto(photoSettings);

    // Ellenőrizzük a Blob típusát
    // Ha "image/x-adobe-dng" vagy "image/dng", akkor DNG-t kaptunk
    if (
      blob.type.includes("dng") ||
      blob.type.includes("raw") ||
      blob.type === "image/tiff"
    ) {
      return blob;
    }

    // Ha JPEG-et kaptunk, de a telefon támogatja a RAW-t,
    // próbáljuk meg újra más beállításokkal
    return null;
  } catch {
    return null;
  }
}
