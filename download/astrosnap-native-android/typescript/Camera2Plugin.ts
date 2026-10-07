// TypeScript interfész a Camera2Plugin használatához
// Ez a frontend-en használható a natív Android plugin hívására
// (a böngészőben nem működik, csak Capacitor wrapper-ben)

import type { AstroSettings as CameraSettings } from "@/lib/astro/types";

export interface Camera2Capabilities {
  manualSensorSupported: boolean;
  rawFormatSupported: boolean;
  manualWhiteBalanceSupported: boolean;
  minIso: number;
  maxIso: number;
  minExposureSeconds: number;
  maxExposureSeconds: number;
  effectiveMaxExposureSeconds: number;
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

export interface CaptureResult {
  success: boolean;
  path: string;
  width: number;
  height: number;
  fileSize: number;
  format: "jpeg" | "dng";
  frameType: "light" | "dark" | "flat" | "bias";
  error?: string;
}

export interface BurstResult {
  success: boolean;
  paths: string[];
  count: number;
  error?: string;
}

export interface Camera2PluginInterface {
  openCamera(options: {
    facing?: "back" | "front";
    cameraId?: string;
  }): Promise<{ success: boolean; cameraId: string; capabilities: Camera2Capabilities }>;

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
  }): Promise<CaptureResult>;

  captureBurst(options: {
    exposureSeconds: number;
    iso: number;
    frameCount: number;
    intervalSeconds: number;
    rawFormat?: boolean;
    outputDir?: string;
  }): Promise<BurstResult>;

  captureDarkFrame(options: {
    exposureSeconds: number;
    iso: number;
    rawFormat?: boolean;
    outputDir?: string;
  }): Promise<CaptureResult>;

  captureFlatFrame(options: {
    exposureSeconds: number;
    iso: number;
    rawFormat?: boolean;
    outputDir?: string;
  }): Promise<CaptureResult>;

  captureBiasFrame(options: {
    iso: number;
    rawFormat?: boolean;
    outputDir?: string;
  }): Promise<CaptureResult>;

  getCapabilities(): Promise<{ success: boolean; capabilities: Camera2Capabilities }>;

  setManualControls(options: {
    zoom?: number;
    focusMode?: "auto" | "manual" | "infinity";
    focusDistance?: number;
    iso?: number;
    whiteBalanceK?: number;
  }): Promise<{ success: boolean }>;
}

/**
 * Plugin detektálása és beállítása.
 * Ez a függvény meghívja a natív Camera2Plugin-t, ha elérhető
 * (Capacitor wrapper-ben fut az app), különben null-t ad vissza,
 * és a PWA webes fallback-jét használja.
 */
export async function getCamera2Plugin(): Promise<Camera2PluginInterface | null> {
  try {
    // Capacitor plugin regisztráció ellenőrzése
    if (typeof window !== "undefined" && (window as any).Capacitor) {
      const { Capacitor } = (window as any);
      const isNative = Capacitor.isNativePlatform?.();
      if (isNative) {
        // Dynamically import the plugin to avoid bundler issues in browser
        const { Camera2Plugin } = await import("hu.astrosnap.camera2");
        return Camera2Plugin as Camera2PluginInterface;
      }
    }
    return null;
  } catch (e) {
    console.warn("Camera2 plugin nem elérhető:", e);
    return null;
  }
}

/**
 * Helper: ellenőrzi, hogy a natív Camera2 plugin elérhető-e.
 */
export function isCamera2PluginAvailable(): boolean {
  try {
    if (typeof window !== "undefined" && (window as any).Capacitor) {
      const { Capacitor } = (window as any);
      return Capacitor.isNativePlatform?.() ?? false;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Helper: Átalakítja az AstroSettings-t Camera2Plugin hívássá.
 */
export function settingsToCaptureOptions(
  settings: CameraSettings,
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
      settings.focusMode === "manual"
        ? settings.focusDistance ?? 0
        : 0,
    zoom: settings.zoomFactor || 1,
    rawFormat: options?.rawFormat ?? settings.rawRecommended,
    outputDir: options?.outputDir ?? `AstroSnap/${options?.frameType ?? "light"}`,
  };
}
