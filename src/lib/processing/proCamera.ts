// Pro Camera API - ImageCapture PhotoSettings és MediaTrackConstraints
//
// A kulcsfontosságú felismerés: az `exposureTime` csak akkor működik,
// ha először `exposureMode: "manual"`-ra állítjuk a track-et!
// Enélkül az automatikus expozíció (AE) felülírja a beállítást.
//
// A folyamat:
// 1. track.applyConstraints({ advanced: [{ exposureMode: "manual", exposureTime, iso, ... }] })
// 2. Várakozás, amíg a beállítások érvénybe lépnek (500ms)
// 3. getSettings() ellenőrzése - logoljuk, hogy tényleg beállította-e
// 4. imageCapture.takePhoto() - ez várni fog az expozíció befejezésére!
// 5. Időtartam mérése - ha rögtön visszatér, nem volt hosszú expozíció

export interface ProPhotoSettings {
  // Expozíciós idő nanosecundumban (1s = 1_000_000_000 ns)
  exposureTime?: number;
  // ISO érték
  iso?: number;
  // Fókusz mód
  focusMode?: "auto" | "manual" | "continuous";
  // Fókusz távolság
  focusDistance?: number;
  // Fehérmérleg mód
  whiteBalanceMode?: "auto" | "manual" | "continuous";
  // Fehérmérleg hőmérséklet Kelvinben
  whiteBalanceTemperature?: number;
  // Kép szélessége
  imageWidth?: number;
  // Kép magassága
  imageHeight?: number;
  // Fényforrás mód
  fillLightMode?: "auto" | "off" | "flash" | "torch";
}

export interface ProCameraCapabilities {
  exposureTimeSupported: boolean;
  minExposureTime: number;
  maxExposureTime: number;
  isoSupported: boolean;
  minIso: number;
  maxIso: number;
  manualFocusSupported: boolean;
  manualWhiteBalanceSupported: boolean;
  fillLightModes: string[];
  rawSupported: boolean;
}

// A TypeScript nem tartalmazza ezeket a típusokat, ezért definiáljuk őket
interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  exposureTime?: { min: number; max: number; step: number };
  iso?: { min: number; max: number; step: number };
  exposureMode?: string[];
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step: number };
  whiteBalanceMode?: string[];
  whiteBalanceTemperature?: { min: number; max: number; step: number };
  fillLightMode?: string[];
  torch?: boolean;
}

interface ExtendedMediaTrackSettings extends MediaTrackSettings {
  exposureTime?: number;
  iso?: number;
  exposureMode?: string;
  focusMode?: string;
  focusDistance?: number;
  whiteBalanceMode?: string;
  whiteBalanceTemperature?: number;
}

interface ExtendedMediaTrackConstraintSet extends MediaTrackConstraintSet {
  exposureTime?: number;
  iso?: number;
  exposureMode?: string;
  focusMode?: string;
  focusDistance?: number;
  whiteBalanceMode?: string;
  whiteBalanceTemperature?: number;
  torch?: boolean;
}

/**
 * Lekéri a kamera képességeit (capabilities).
 */
export async function getProCameraCapabilities(
  stream: MediaStream
): Promise<ProCameraCapabilities | null> {
  const track = stream.getVideoTracks()[0];
  if (!track || !track.getCapabilities) return null;

  const capabilities = track.getCapabilities() as ExtendedMediaTrackCapabilities;

  return {
    exposureTimeSupported: !!capabilities.exposureTime,
    minExposureTime: capabilities.exposureTime?.min ?? 0,
    maxExposureTime: capabilities.exposureTime?.max ?? 0,
    isoSupported: !!capabilities.iso,
    minIso: capabilities.iso?.min ?? 0,
    maxIso: capabilities.iso?.max ?? 0,
    manualFocusSupported: !!capabilities.focusMode && !!capabilities.focusDistance,
    manualWhiteBalanceSupported: !!capabilities.whiteBalanceMode,
    fillLightModes: capabilities.fillLightMode ?? [],
    rawSupported: false,
  };
}

/**
 * BEÁLLÍTJA a kamera track-jét a megadott profi beállításokra.
 * Ez a kulcsfontosságú lépés - a track constraints-eket kell beállítani,
 * nem csak a PhotoSettings-t átadni a takePhoto-nak!
 *
 * @param stream A MediaStream
 * @param settings A beállítások
 * @returns A ténylegesen alkalmazott beállítások (getSettings-ből)
 */
export async function applyProCameraSettings(
  stream: MediaStream,
  settings: ProPhotoSettings
): Promise<ExtendedMediaTrackSettings> {
  const track = stream.getVideoTracks()[0];
  if (!track) {
    throw new Error("Nincs videó track a stream-ben");
  }

  console.log("📷 Pro Camera beállítások alkalmazása a track-re:", settings);

  // A constraint-ek összeállítása
  // FONTOS: exposureMode: "manual" kell, különben az exposureTime-t figyelmen kívül hagyja!
  const constraints: ExtendedMediaTrackConstraintSet = {};

  if (settings.exposureTime !== undefined) {
    constraints.exposureMode = "manual";
    constraints.exposureTime = settings.exposureTime;
    console.log(`  → exposureMode: "manual", exposureTime: ${settings.exposureTime} ns (${(settings.exposureTime / 1_000_000_000).toFixed(2)}s)`);
  }

  if (settings.iso !== undefined) {
    constraints.iso = settings.iso;
    console.log(`  → iso: ${settings.iso}`);
  }

  if (settings.focusMode === "manual") {
    constraints.focusMode = "manual";
    if (settings.focusDistance !== undefined) {
      constraints.focusDistance = settings.focusDistance;
    }
    console.log(`  → focusMode: "manual", focusDistance: ${settings.focusDistance}`);
  } else if (settings.focusMode === "continuous") {
    constraints.focusMode = "continuous";
  }

  if (settings.whiteBalanceMode === "manual") {
    constraints.whiteBalanceMode = "manual";
    if (settings.whiteBalanceTemperature !== undefined) {
      constraints.whiteBalanceTemperature = settings.whiteBalanceTemperature;
    }
    console.log(`  → whiteBalanceMode: "manual", whiteBalanceTemperature: ${settings.whiteBalanceTemperature}K`);
  } else if (settings.whiteBalanceMode === "continuous") {
    constraints.whiteBalanceMode = "continuous";
  }

  // Alkalmazzuk a constraint-eket
  try {
    await track.applyConstraints({
      advanced: [constraints as MediaTrackConstraintSet],
    });
    console.log("✓ Track constraints alkalmazva");
  } catch (err) {
    console.error("✗ Track constraints alkalmazása sikertelen:", err);
    throw new Error(`Track constraints hiba: ${err}`);
  }

  // Várakozunk, hogy a beállítások érvénybe lépjenek
  // A kamera hardvernek idő kell, hogy változtassa az expozíciós beállításokat
  await new Promise((resolve) => setTimeout(resolve, 800));
  console.log("⏱ Vártunk 800ms-t a beállítások érvénybe lépésére");

  // Ellenőrizzük a beállításokat
  const actualSettings = track.getSettings() as ExtendedMediaTrackSettings;
  console.log("📋 Tényleges beállítások a getSettings-ből:", {
    exposureMode: actualSettings.exposureMode,
    exposureTime: actualSettings.exposureTime,
    iso: actualSettings.iso,
    focusMode: actualSettings.focusMode,
    focusDistance: actualSettings.focusDistance,
    whiteBalanceMode: actualSettings.whiteBalanceMode,
    whiteBalanceTemperature: actualSettings.whiteBalanceTemperature,
  });

  // Ha az exposureTime nem egyezik, figyelmeztetünk
  if (settings.exposureTime !== undefined && actualSettings.exposureTime !== settings.exposureTime) {
    console.warn(
      `⚠ Az exposureTime nem egyezik! Beállított: ${settings.exposureTime}, tényleges: ${actualSettings.exposureTime}`
    );
  }

  return actualSettings;
}

/**
 * Készít egy képet a megadott profi beállításokkal.
 * Ez a függvény:
 * 1. Beállítja a track constraint-eket (exposureMode=manual, exposureTime, iso, focusMode, stb.)
 * 2. Vár 800ms-t, hogy a beállítások érvénybe lépjenek
 * 3. Meghívja az imageCapture.takePhoto()-t, ami VÁRNI FOG az expozíció befejezésére!
 * 4. Méri a takePhoto időtartamát - ha < 1s, akkor nem volt hosszú expozíció
 *
 * @param stream A MediaStream
 * @param settings A profi beállítások
 * @returns Blob a képpel
 */
export async function captureWithProSettings(
  stream: MediaStream,
  settings: ProPhotoSettings
): Promise<Blob> {
  const track = stream.getVideoTracks()[0];
  if (!track) {
    throw new Error("Nincs videó track a stream-ben");
  }

  // 1. Beállítjuk a track-et (exposureMode=manual, exposureTime, iso, stb.)
  await applyProCameraSettings(stream, settings);

  // 2. takePhoto - ez várni fog, amíg a szenzor befejezi az expozíciót!
  if (typeof ImageCapture === "undefined") {
    throw new Error("ImageCapture API nem támogatott");
  }

  const imageCapture = new ImageCapture(track);

  console.log(`📸 takePhoto() hívása... (várjuk a ${
    settings.exposureTime ? (settings.exposureTime / 1_000_000_000).toFixed(2) + "s expozíciót" : "képet"
  })`);

  const startTime = performance.now();

  try {
    // A takePhoto PhotoSettings is megkapja a beállításokat,
    // de a track constraints a fontosabb
    const photoSettings: PhotoSettings = {
      imageWidth: settings.imageWidth,
      imageHeight: settings.imageHeight,
    };

    // Ha az exposureTime be van állítva, azt is átadhatjuk a PhotoSettings-nek
    // (a track constraints már beállította, de redundancy nem árt)
    if (settings.exposureTime !== undefined) {
      (photoSettings as PhotoSettings & { exposureTime?: number }).exposureTime = settings.exposureTime;
    }
    if (settings.iso !== undefined) {
      (photoSettings as PhotoSettings & { iso?: number }).iso = settings.iso;
    }

    const blob = await imageCapture.takePhoto(photoSettings);
    const duration = performance.now() - startTime;
    const durationSec = (duration / 1000).toFixed(2);

    console.log(`✓ takePhoto() befejezve ${durationSec}s alatt!`);

    // Ha a beállított expozíció > 1s, de a takePhoto < 1s volt,
    // akkor a telefon valószínűleg nem támogatja a valódi hosszú expozíciót
    if (settings.exposureTime && settings.exposureTime > 1_000_000_000 && duration < 1000) {
      console.warn(
        `⚠ FIGYELMEZTETÉS: A beállított expozíció ${(
          settings.exposureTime / 1_000_000_000
        ).toFixed(2)}s volt, de a takePhoto csak ${durationSec}s-ig tartott! ` +
          `Ez azt jelenti, hogy a telefon NEM végezte el a valódi hosszú expozíciót.`
      );
    } else if (settings.exposureTime && settings.exposureTime > 1_000_000_000) {
      console.log(
        `✓ Hosszú expozíció megerősítve: ${durationSec}s (beállított: ${(
          settings.exposureTime / 1_000_000_000
        ).toFixed(2)}s)`
      );
    }

    return blob;
  } catch (err) {
    const duration = performance.now() - startTime;
    console.error(`✗ takePhoto hiba ${duration}ms után:`, err);
    throw err;
  }
}

/**
 * Ellenőrzi, hogy a böngésző támogatja-e a Pro Camera funkciókat.
 */
export function isProCameraSupported(): boolean {
  return (
    typeof ImageCapture !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices
  );
}

/**
 * Átalakítja a másodpercben megadott expozíciós időt nanosecundumba.
 */
export function secondsToNanoseconds(seconds: number): number {
  return Math.round(seconds * 1_000_000_000);
}

/**
 * Átalakítja a nanosecundumban megadott expozíciós időt másodperccé.
 */
export function nanosecondsToSeconds(ns: number): number {
  return ns / 1_000_000_000;
}

/**
 * Visszaállítja a kamerát auto módra (a capture után).
 */
export async function resetToAuto(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track || !track.applyConstraints) return;

  try {
    await track.applyConstraints({
      advanced: [
        {
          exposureMode: "continuous",
          focusMode: "continuous",
          whiteBalanceMode: "continuous",
        } as MediaTrackConstraintSet,
      ],
    });
    console.log("✓ Kamera visszaállítva auto módra");
  } catch (err) {
    console.warn("Visszaállítás auto módra sikertelen:", err);
  }
}

/**
 * Próbál DNG (RAW) kimenetet kérni.
 * Ez csak akkor működik, ha a telefon támogatja a RAW formátumot.
 */
export async function captureRawDng(
  stream: MediaStream,
  settings: ProPhotoSettings = {}
): Promise<Blob | null> {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof ImageCapture === "undefined") return null;

  // Ellenőrizzük, hogy a track támogatja-e a RAW formátumot
  const caps = track.getCapabilities() as ExtendedMediaTrackCapabilities & {
    raw?: boolean;
  };
  if (!caps.raw) {
    return null;
  }

  try {
    // Beállítjuk a track-et először
    await applyProCameraSettings(stream, settings);

    const imageCapture = new ImageCapture(track);
    const blob = await imageCapture.takePhoto();

    // Ellenőrizzük a Blob típusát
    if (
      blob.type.includes("dng") ||
      blob.type.includes("raw") ||
      blob.type === "image/tiff"
    ) {
      return blob;
    }
    return null;
  } catch {
    return null;
  }
}
