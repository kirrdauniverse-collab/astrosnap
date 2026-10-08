// Pro Camera API - Valódi hosszú expozíció grabFrame() segítségével
//
// A KULCSFELISMERÉS:
// A `takePhoto()` külön capture pipeline-t használ, ami IGNOREÁLJA a track
// exposure beállításait. Ezért hiába állítjuk be exposureMode="manual" és
// exposureTime=17.7s, a takePhoto() csak csinál egy normál auto-expo fotót.
//
// A MEGOLDÁS: `grabFrame()` használata!
// A grabFrame() a video stream-ből vesz egy képkockát. Ha a track-en be van
// állítva exposureMode="manual" és exposureTime=17.7s, akkor a video stream
// lelassul és minden képkocka 17.7 másodpercig van exponálva.
// A grabFrame() ezt a hosszú expozíciós képkockát kapja el!
//
// A folyamat:
// 1. applyConstraints({ exposureMode: "manual", exposureTime: 17_700_000_000 })
// 2. Várunk, amíg a track mute-ol (beállítások alkalmazása folyamatban)
// 3. Várunk, amíg a track unmute-ol (új képkockák jönnek új beállításokkal)
// 4. Várunk exposureTime + 2 másodpercet (az első hosszú expozíciós képkocka befejezéséig)
// 5. grabFrame() - elkapja a hosszú expozíciós képkockát!

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

export interface ProPhotoSettings {
  exposureTime?: number; // nanosecundumban
  iso?: number;
  focusMode?: "auto" | "manual" | "continuous";
  focusDistance?: number;
  whiteBalanceMode?: "auto" | "manual" | "continuous";
  whiteBalanceTemperature?: number;
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
}

/**
 * Lekéri a kamera képességeit.
 */
export async function getProCameraCapabilities(
  stream: MediaStream
): Promise<ProCameraCapabilities | null> {
  const track = stream.getVideoTracks()[0];
  if (!track || !track.getCapabilities) return null;

  const caps = track.getCapabilities() as ExtendedMediaTrackCapabilities;

  const result: ProCameraCapabilities = {
    exposureTimeSupported: !!caps.exposureTime,
    minExposureTime: caps.exposureTime?.min ?? 0,
    maxExposureTime: caps.exposureTime?.max ?? 0,
    isoSupported: !!caps.iso,
    minIso: caps.iso?.min ?? 0,
    maxIso: caps.iso?.max ?? 0,
    manualFocusSupported: !!caps.focusMode && !!caps.focusDistance,
    manualWhiteBalanceSupported: !!caps.whiteBalanceMode,
  };

  console.log("📷 Pro kamera képességek:", result);
  if (result.exposureTimeSupported) {
    console.log(
      `  → exposureTime: ${result.minExposureTime}ns - ${result.maxExposureTime}ns ` +
        `= ${(result.minExposureTime / 1e9).toFixed(3)}s - ${(result.maxExposureTime / 1e9).toFixed(1)}s`
    );
  }
  if (result.isoSupported) {
    console.log(`  → ISO: ${result.minIso} - ${result.maxIso}`);
  }
  console.log(`  → Manual fókusz: ${result.manualFocusSupported ? "✓" : "✗"}`);
  console.log(`  → Manual WB: ${result.manualWhiteBalanceSupported ? "✓" : "✗"}`);

  return result;
}

/**
 * Beállítja a track-et manual exposure-re.
 * Ez a video stream minden képkockáját hosszú expozícióra állítja!
 */
export async function applyProCameraSettings(
  stream: MediaStream,
  settings: ProPhotoSettings
): Promise<ExtendedMediaTrackSettings> {
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("Nincs videó track");

  const constraints: ExtendedMediaTrackConstraintSet = {};

  // A KULCS: exposureMode="manual" kell az exposureTime előtt!
  if (settings.exposureTime !== undefined) {
    constraints.exposureMode = "manual";
    constraints.exposureTime = settings.exposureTime;
    console.log(
      `  → exposureMode: "manual", exposureTime: ${settings.exposureTime}ns ` +
        `(${(settings.exposureTime / 1e9).toFixed(2)}s)`
    );
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

  if (settings.whiteBalanceMode === "manual" && settings.whiteBalanceTemperature !== undefined) {
    constraints.whiteBalanceMode = "manual";
    constraints.whiteBalanceTemperature = settings.whiteBalanceTemperature;
    console.log(`  → whiteBalanceMode: "manual", WB: ${settings.whiteBalanceTemperature}K`);
  } else if (settings.whiteBalanceMode === "continuous") {
    constraints.whiteBalanceMode = "continuous";
  }

  // Alkalmazzuk a constraint-eket
  await track.applyConstraints({
    advanced: [constraints as MediaTrackConstraintSet],
  });
  console.log("✓ Track constraints elküldve");

  // Várunk a track mute/unmute eseményeire
  // Amikor a beállítások megváltoznak, a track mute-ol (nincs frame),
  // majd unmute-ol amikor az új beállításokkal jön az első frame
  await waitForTrackReady(track);

  // Ellenőrizzük a beállításokat
  const actualSettings = track.getSettings() as ExtendedMediaTrackSettings;
  console.log("📋 Tényleges beállítások:", {
    exposureMode: actualSettings.exposureMode,
    exposureTime: actualSettings.exposureTime,
    iso: actualSettings.iso,
    focusMode: actualSettings.focusMode,
    focusDistance: actualSettings.focusDistance,
    whiteBalanceMode: actualSettings.whiteBalanceMode,
  });

  if (
    settings.exposureTime !== undefined &&
    actualSettings.exposureTime !== settings.exposureTime
  ) {
    console.warn(
      `⚠ exposureTime mismatch! Kért: ${settings.exposureTime}, kapott: ${actualSettings.exposureTime}`
    );
  }

  return actualSettings;
}

/**
 * Vár a track-re, amíg a beállítások érvénybe lépnek.
 * A track mute-ol amikor beállítások változnak, unmute-ol amikor kész.
 */
function waitForTrackReady(track: MediaStreamTrack): Promise<void> {
  return new Promise((resolve) => {
    // Ha már unmute-olt, rögtön folytatjuk
    if (!track.muted) {
      // Kis várakozás a beállítások érvénybe lépéséért
      setTimeout(resolve, 500);
      return;
    }

    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      track.removeEventListener("unmute", finish);
      // Extra várakozás az első frame megérkezéséért
      setTimeout(resolve, 500);
    };

    track.addEventListener("unmute", finish);
    // Timeout fallback: 5 másodperc
    setTimeout(finish, 5000);
  });
}

/**
 * A VALÓDI HOSSZÚ EXPOZÍCIÓ FÜGGVÉNY!
 *
 * Ez a függvény:
 * 1. Beállítja a track-et exposureMode="manual", exposureTime=Xns
 * 2. Vár amíg a beállítások érvénybe lépnek (track unmute)
 * 3. Vár exposureTime másodpercet (amíg az első hosszú expozíciós frame befejeződik)
 * 4. grabFrame() - elkapja a hosszú expozíciós képkockát!
 *
 * A grabFrame() a video stream-ből vesz egy frame-et, ami már be van állítva
 * hosszú expozícióra. Ez NEM a takePhoto(), ami külön pipeline-t használ!
 *
 * @param stream A MediaStream
 * @param settings A beállítások (exposureTime nanosecundumban!)
 * @returns ImageData a hosszú expozíciós képkockával
 */
export async function captureLongExposureFrame(
  stream: MediaStream,
  settings: ProPhotoSettings
): Promise<ImageData> {
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("Nincs videó track");

  if (typeof ImageCapture === "undefined") {
    throw new Error("ImageCapture API nem támogatott");
  }

  const exposureSeconds = settings.exposureTime
    ? settings.exposureTime / 1e9
    : 0;

  console.log(
    `📸 Hosszú expozíció: ${exposureSeconds.toFixed(2)}s, ISO ${settings.iso}`
  );

  // 1. Beállítjuk a track-et manual exposure-re
  await applyProCameraSettings(stream, settings);

  // 2. Várunk exposureTime + 1 másodpercet
  // Amikor a track exposureTime=17.7s-re van állítva, a video stream
  // lelassul és minden frame 17.7 másodpercig van exponálva.
  // Az első hosszú expozíciós frame befejezéséhez ennyi idő kell.
  const waitMs = Math.max(1000, exposureSeconds * 1000 + 1000);
  console.log(`⏱ Várunk ${waitMs}ms-t a hosszú expozíciós frame-re...`);

  // Progress callback a hosszú várakozás alatt
  const progressCallback = (window as unknown as { __captureProgress?: (p: number, msg: string) => void }).__captureProgress;
  if (progressCallback) {
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percent = Math.min(90, Math.round((elapsed / waitMs) * 100));
      progressCallback(percent, `Hosszú expozíció folyamatban: ${exposureSeconds.toFixed(1)}s...`);
    }, 500);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    clearInterval(progressInterval);
  } else {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // 3. grabFrame() - elkapja a hosszú expozíciós frame-et!
  const imageCapture = new ImageCapture(track);
  console.log("📸 grabFrame() hívása...");

  const startTime = performance.now();
  const frame = await imageCapture.grabFrame();
  const duration = performance.now() - startTime;

  console.log(
    `✓ grabFrame() befejezve ${(duration / 1000).toFixed(2)}s alatt! ` +
      `Kép mérete: ${frame.width}×${frame.height}`
  );

  // A grabFrame() ImageBitmap-et ad vissza, konvertáljuk ImageData-vá
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(frame, 0, 0);
  const imageData = ctx.getImageData(0, 0, frame.width, frame.height);

  // Ellenőrizzük: ha a kép teljesen fehér, akkor tényleg hosszú expozíció volt!
  // (A számítógép asztal hosszú expozíciónál teljesen kiégne.)
  const sampleSize = Math.min(1000, frame.width * frame.height);
  let totalBrightness = 0;
  const data = imageData.data;
  for (let i = 0; i < sampleSize * 4; i += 4) {
    totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  const avgBrightness = totalBrightness / sampleSize;
  console.log(
    `📊 Átlagos fényerő: ${avgBrightness.toFixed(1)}/255 ` +
      `(${avgBrightness > 200 ? "TÚLEXPONÁLT - hosszú expozíció MŰKÖDIK!" : avgBrightness > 100 ? "világos" : "sötét"})`
  );

  return imageData;
}

/**
 * Visszaállítja a kamerát auto módra.
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
    console.warn("Visszaállítás sikertelen:", err);
  }
}

export function isProCameraSupported(): boolean {
  return (
    typeof ImageCapture !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices
  );
}

export function secondsToNanoseconds(seconds: number): number {
  return Math.round(seconds * 1_000_000_000);
}

export function nanosecondsToSeconds(ns: number): number {
  return ns / 1_000_000_000;
}
