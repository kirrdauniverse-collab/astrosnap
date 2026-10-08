/**
 * Native Camera Bridge - hid a webes és natív Camera2 API között
 *
 * Ez a fájl automatikusan érzékeli, hogy a PWA natív Android környezetben fut-e
 * (Capacitor wrapperrel). Ha igen, a natív Camera2Plugin-t használja a hosszú
 * expozícióhoz és RAW mentéshez. Ha böngészőben fut, a webes fallback-et.
 */

import type { AstroSettings } from "@/lib/astro/types";

// Natív Camera2 plugin interface (Capacitor)
export interface NativeCamera2Plugin {
  openCamera(options: {
    facing?: "back" | "front";
    cameraId?: string;
  }): Promise<{
    success: boolean;
    cameraId: string;
    capabilities: NativeCameraCapabilities;
    error?: string;
  }>;

  closeCamera(): Promise<{ success: boolean }>;

  captureLongExposure(options: {
    exposureSeconds: number;
    iso: number;
    whiteBalanceK?: number;
    focusMode?: "auto" | "manual" | "infinity";
    focusDistance?: number;
    zoom?: number;
    rawFormat?: boolean;
    outputDir?: string;
    fileName?: string;
  }): Promise<NativeCaptureResult>;

  captureBurst(options: {
    exposureSeconds: number;
    iso: number;
    frameCount: number;
    intervalSeconds: number;
    rawFormat?: boolean;
    outputDir?: string;
  }): Promise<{ success: boolean; paths: string[]; count: number }>;

  captureDarkFrame(options: {
    exposureSeconds: number;
    iso: number;
    rawFormat?: boolean;
    outputDir?: string;
  }): Promise<NativeCaptureResult>;

  captureFlatFrame(options: {
    exposureSeconds: number;
    iso: number;
    rawFormat?: boolean;
    outputDir?: string;
  }): Promise<NativeCaptureResult>;

  captureBiasFrame(options: {
    iso: number;
    rawFormat?: boolean;
    outputDir?: string;
  }): Promise<NativeCaptureResult>;

  getCapabilities(): Promise<{
    success: boolean;
    capabilities: NativeCameraCapabilities;
  }>;

  setManualControls(options: {
    zoom?: number;
    focusMode?: "auto" | "manual" | "infinity";
    focusDistance?: number;
    iso?: number;
    whiteBalanceK?: number;
  }): Promise<{ success: boolean }>;
}

export interface NativeCameraCapabilities {
  manualSensorSupported: boolean;
  rawFormatSupported: boolean;
  manualWhiteBalanceSupported: boolean;
  minIso: number;
  maxIso: number;
  minExposureSeconds: number;
  maxExposureSeconds: number;
  manualFocusSupported: boolean;
  minFocusDistance: number;
  zoomSupported: boolean;
  minZoom: number;
  maxZoom: number;
  sensorWidth: number;
  sensorHeight: number;
  megapixels: number;
  maxJpegWidth: number;
  maxJpegHeight: number;
  flashSupported: boolean;
  cameraId: string;
  lensFacing: "back" | "front";
}

export interface NativeCaptureResult {
  success: boolean;
  path: string;
  width: number;
  height: number;
  fileSize: number;
  format: "jpeg" | "dng";
  frameType: "light" | "dark" | "flat" | "bias";
  error?: string;
}

// Globálisan regisztrált Capacitor plugin
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      Plugins: {
        Camera2Plugin?: NativeCamera2Plugin;
      };
    };
  }
}

/**
 * Ellenőrzi, hogy a natív Camera2 plugin elérhető-e.
 * Ez akkor igaz, ha az app Capacitor wrapper-ben fut Androidon.
 */
export function isNativeCamera2Available(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = window.Capacitor;
  if (!capacitor) return false;
  if (!capacitor.isNativePlatform || !capacitor.isNativePlatform()) return false;
  return !!capacitor.Plugins?.Camera2Plugin;
}

/**
 * Visszaadja a natív Camera2 plugin példányt, vagy null-t, ha nem elérhető.
 */
export function getNativeCamera2Plugin(): NativeCamera2Plugin | null {
  if (!isNativeCamera2Available()) return null;
  return window.Capacitor!.Plugins.Camera2Plugin!;
}

/**
 * Átalakítja az AstroSettings-t natív capture hívássá.
 */
export function settingsToNativeCaptureOptions(
  settings: AstroSettings,
  options?: {
    rawFormat?: boolean;
    outputDir?: string;
    frameType?: "light" | "dark" | "flat" | "bias";
  }
) {
  return {
    exposureSeconds: settings.exposureSeconds,
    iso: settings.iso,
    whiteBalanceK: settings.whiteBalanceK,
    focusMode: settings.focusMode,
    focusDistance:
      settings.focusMode === "manual" ? settings.focusDistance ?? 0 : 0,
    zoom: settings.zoomFactor || 1,
    rawFormat: options?.rawFormat ?? settings.rawRecommended,
    outputDir:
      options?.outputDir ?? `AstroSnap/${options?.frameType ?? "light"}`,
  };
}

/**
 * Natív hosszú expozíció készítése.
 * Ha a natív plugin elérhető, azt használja (valódi hosszú expozíció!).
 * Ha nem, null-t ad vissza, és a hívó webes fallback-et használ.
 *
 * @param settings Az asztrofotó beállítások
 * @param onProgress Progress callback
 * @returns A natív capture eredménye, vagy null ha nem elérhető
 */
export async function captureWithNativeCamera2(
  settings: AstroSettings,
  onProgress?: (percent: number, message: string) => void
): Promise<NativeCaptureResult | null> {
  const plugin = getNativeCamera2Plugin();
  if (!plugin) return null;

  // Először megnyitjuk a kamerát (ha még nincs nyitva)
  try {
    const caps = await plugin.getCapabilities();
    if (!caps.success) {
      console.warn("Natív kamera képességek lekérése sikertelen");
      return null;
    }

    console.log("📷 Natív Camera2 képességek:", caps.capabilities);
    if (caps.capabilities.manualSensorSupported) {
      console.log(
        `  → Hosszú záridő: ${caps.capabilities.minExposureSeconds}s - ${caps.capabilities.maxExposureSeconds}s`
      );
      console.log(`  → ISO: ${caps.capabilities.minIso} - ${caps.capabilities.maxIso}`);
      console.log(`  → RAW (DNG): ${caps.capabilities.rawFormatSupported ? "✓" : "✗"}`);
    }
  } catch (e) {
    console.warn("Kamera képességek lekérése sikertelen:", e);
    return null;
  }

  // Capture hívás
  try {
    onProgress?.(10, "Kamera előkészítése...");

    const result = await plugin.captureLongExposure({
      exposureSeconds: settings.exposureSeconds,
      iso: settings.iso,
      whiteBalanceK: settings.whiteBalanceK,
      focusMode: settings.focusMode,
      focusDistance: 0,
      zoom: settings.zoomFactor || 1,
      rawFormat: settings.rawRecommended,
      outputDir: "AstroSnap/light",
    });

    if (result.success) {
      console.log(`✓ Natív hosszú expozíció kész: ${result.path}`);
      console.log(`  → Méret: ${result.width}×${result.height}`);
      console.log(`  → Formátum: ${result.format}`);
      console.log(`  → Fájlméret: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
      onProgress?.(100, "Kész!");
      return result;
    } else {
      console.error("✗ Natív capture sikertelen:", result.error);
      return null;
    }
  } catch (e) {
    console.error("✗ Natív capture hiba:", e);
    return null;
  }
}

/**
 * Progress event listener a natív pluginhez.
 * A Capacitor plugin `notifyListeners` hívásokkal küld progress eventeket.
 */
export function addNativeProgressListener(
  callback: (percent: number, message: string) => void
): () => void {
  if (typeof window === "undefined" || !window.Capacitor) {
    return () => {};
  }

  // A Capacitor event listener regisztrálása
  const handleProgress = (event: { percent: number; message: string }) => {
    callback(event.percent, event.message);
  };

  // Capacitor event listener
  window.Capacitor.Plugins.Camera2Plugin?.addListener?.(
    "camera2:captureProgress",
    handleProgress
  );

  return () => {
    window.Capacitor?.Plugins?.Camera2Plugin?.removeListener?.(
      handleProgress
    );
  };
}

/**
 * Natív burst sorozat készítése.
 */
export async function captureBurstWithNativeCamera2(
  settings: AstroSettings,
  onProgress?: (percent: number, message: string) => void
): Promise<{ paths: string[]; count: number } | null> {
  const plugin = getNativeCamera2Plugin();
  if (!plugin) return null;

  try {
    const result = await plugin.captureBurst({
      exposureSeconds: settings.exposureSeconds,
      iso: settings.iso,
      frameCount: settings.burstCount,
      intervalSeconds: settings.intervalSeconds,
      rawFormat: settings.rawRecommended,
      outputDir: "AstroSnap/light",
    });

    if (result.success) {
      console.log(`✓ Natív burst kész: ${result.count} kép`);
      return { paths: result.paths, count: result.count };
    }
    return null;
  } catch (e) {
    console.error("✗ Natív burst hiba:", e);
    return null;
  }
}

/**
 * Natív dark frame rögzítése.
 */
export async function captureDarkFrameWithNativeCamera2(
  settings: AstroSettings
): Promise<NativeCaptureResult | null> {
  const plugin = getNativeCamera2Plugin();
  if (!plugin) return null;

  try {
    return await plugin.captureDarkFrame({
      exposureSeconds: settings.exposureSeconds,
      iso: settings.iso,
      rawFormat: settings.rawRecommended,
      outputDir: "AstroSnap/dark",
    });
  } catch (e) {
    console.error("✗ Natív dark frame hiba:", e);
    return null;
  }
}

/**
 * Natív flat frame rögzítése.
 */
export async function captureFlatFrameWithNativeCamera2(
  settings: AstroSettings
): Promise<NativeCaptureResult | null> {
  const plugin = getNativeCamera2Plugin();
  if (!plugin) return null;

  try {
    return await plugin.captureFlatFrame({
      exposureSeconds: 0.5, // Rövid expozíció flat frame-hez
      iso: 200,
      rawFormat: settings.rawRecommended,
      outputDir: "AstroSnap/flat",
    });
  } catch (e) {
    console.error("✗ Natív flat frame hiba:", e);
    return null;
  }
}

/**
 * Natív bias frame rögzítése.
 */
export async function captureBiasFrameWithNativeCamera2(
  settings: AstroSettings
): Promise<NativeCaptureResult | null> {
  const plugin = getNativeCamera2Plugin();
  if (!plugin) return null;

  try {
    return await plugin.captureBiasFrame({
      iso: settings.iso,
      rawFormat: settings.rawRecommended,
      outputDir: "AstroSnap/bias",
    });
  } catch (e) {
    console.error("✗ Natív bias frame hiba:", e);
    return null;
  }
}
