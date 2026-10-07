package hu.astrosnap.camera2;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/**
 * Camera2Plugin – Capacitor plugin natív Camera2 API hozzáféréshez.
 *
 * Ez a plugin lehetővé teszi a PWA AstroSnap app számára, hogy:
 *  - Valódi hosszú expozíciót végezzen (1-30 másodperc)
 *  - RAW (DNG) formátumban mentsen
 *  - Manual ISO-t, fókuszt, fehérmérleget állítson
 *  - Burst sorozatot készítsen
 *  - Dark/Flat/Bias frame-eket rögzítsen
 *
 * Használat a frontend-en:
 *   import { Camera2Plugin } from 'hu.astrosnap.camera2';
 *   await Camera2Plugin.captureLongExposure({ exposureSeconds: 17.7, iso: 3200 });
 */
@CapacitorPlugin(name = "Camera2Plugin")
public class Camera2Plugin extends Plugin {

    private static final int CAMERA_PERMISSION_REQUEST = 1001;
    private Camera2Manager cameraManager;
    private PluginCall pendingPermissionCall;

    @Override
    public void load() {
        super.load();
        cameraManager = new Camera2Manager(getContext());
    }

    /**
     * Ellenőrzi, hogy a CAMERA permission megvan-e.
     * Ha nincs, kéri, és a callback-et elmenti későbbi felhasználásra.
     */
    private boolean ensureCameraPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            return true;
        }
        pendingPermissionCall = call;
        ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{Manifest.permission.CAMERA},
                CAMERA_PERMISSION_REQUEST
        );
        return false;
    }

    @Override
    public void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.handleRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST) {
            if (pendingPermissionCall != null) {
                if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    // Engedély megadva – újrapróbáljuk a hívást
                    String method = pendingPermissionCall.getMethodName();
                    handle(pendingPermissionCall);
                } else {
                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("error", "Camera permission denied");
                    pendingPermissionCall.reject("Camera permission denied");
                }
                pendingPermissionCall = null;
            }
        }
    }

    /**
     * Kamera megnyitása és előnézet indítása.
     * Opciók:
     *   - facing: "back" (alapértelmezett) vagy "front"
     *   - cameraId: konkrét kamera ID (opcionális, pl. "0" a fő hátsó kamera)
     *
     * Visszatérési érték:
     *   - success: boolean
     *   - cameraId: string
     *   - capabilities: object (zoom, focus, exposure támogatottság)
     */
    @PluginMethod
    public void openCamera(PluginCall call) {
        if (!ensureCameraPermission(call)) return;

        String facing = call.getString("facing", "back");
        String cameraId = call.getString("cameraId", null);

        cameraManager.openCamera(facing, cameraId, new Camera2Manager.CameraOpenCallback() {
            @Override
            public void onOpened(JSObject capabilities) {
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("cameraId", capabilities.getString("cameraId"));
                ret.put("capabilities", capabilities);
                call.resolve(ret);
            }

            @Override
            public void onError(String message) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", message);
                call.resolve(ret);
            }
        });
    }

    /**
     * Kamera bezárása.
     */
    @PluginMethod
    public void closeCamera(PluginCall call) {
        cameraManager.closeCamera();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    /**
     * Valódi hosszú expozíció készítése.
     *
     * Opciók:
     *   - exposureSeconds: double (1.0 - 30.0)
     *   - iso: int (50 - 6400)
     *   - whiteBalanceK: int (2500 - 9000, 0 = auto)
     *   - focusMode: "auto" | "manual" | "infinity"
     *   - focusDistance: float (0.0 - 1.0, csak manual módban)
     *   - zoom: float (1.0 - 8.0)
     *   - rawFormat: boolean (DNG mentés, alapértelmezett: false)
     *   - outputDir: string (pl. "AstroSnap/light")
     *   - fileName: string (opcionális, alapértelmezett: timestamp alapján)
     *
     * Visszatérési érték:
     *   - success: boolean
     *   - path: string (fájl elérési útja)
     *   - width: int
     *   - height: int
     *   - fileSize: long
     *   - format: "jpeg" | "dng"
     */
    @PluginMethod
    public void captureLongExposure(PluginCall call) {
        if (!ensureCameraPermission(call)) return;

        double exposureSeconds = call.getDouble("exposureSeconds", 1.0);
        int iso = call.getInt("iso", 800);
        int whiteBalanceK = call.getInt("whiteBalanceK", 0);
        String focusMode = call.getString("focusMode", "infinity");
        float focusDistance = (float) call.getDouble("focusDistance", 0.0f);
        float zoom = (float) call.getDouble("zoom", 1.0f);
        boolean rawFormat = call.getBoolean("rawFormat", false);
        String outputDir = call.getString("outputDir", "AstroSnap/light");

        CameraSettings settings = new CameraSettings();
        settings.exposureSeconds = exposureSeconds;
        settings.iso = iso;
        settings.whiteBalanceK = whiteBalanceK;
        settings.focusMode = focusMode;
        settings.focusDistance = focusDistance;
        settings.zoom = zoom;
        settings.rawFormat = rawFormat;
        settings.outputDir = outputDir;
        settings.fileName = call.getString("fileName", null);
        settings.frameType = "light";

        cameraManager.captureLongExposure(settings, new Camera2Manager.CaptureCallback() {
            @Override
            public void onSuccess(JSObject result) {
                call.resolve(result);
            }

            @Override
            public void onError(String message) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", message);
                call.resolve(ret);
            }

            @Override
            public void onProgress(int percent, String message) {
                // Progress events a frontend számára
                JSObject ret = new JSObject();
                ret.put("type", "progress");
                ret.put("percent", percent);
                ret.put("message", message);
                notifyListeners("camera2:captureProgress", ret);
            }
        });
    }

    /**
     * Burst sorozat készítése.
     *
     * Opciók: ua. mint a captureLongExposure, plusz:
     *   - frameCount: int (5 - 100)
     *   - intervalSeconds: double (0.1 - 5.0)
     *
     * Visszatérési érték:
     *   - success: boolean
     *   - paths: string[] (fájl elérési utak)
     *   - count: int
     */
    @PluginMethod
    public void captureBurst(PluginCall call) {
        if (!ensureCameraPermission(call)) return;

        double exposureSeconds = call.getDouble("exposureSeconds", 1.0);
        int iso = call.getInt("iso", 800);
        int frameCount = call.getInt("frameCount", 10);
        double intervalSeconds = call.getDouble("intervalSeconds", 1.0);
        boolean rawFormat = call.getBoolean("rawFormat", false);
        String outputDir = call.getString("outputDir", "AstroSnap/light");

        CameraSettings settings = new CameraSettings();
        settings.exposureSeconds = exposureSeconds;
        settings.iso = iso;
        settings.frameCount = frameCount;
        settings.intervalSeconds = intervalSeconds;
        settings.rawFormat = rawFormat;
        settings.outputDir = outputDir;
        settings.frameType = "light";

        cameraManager.captureBurst(settings, new Camera2Manager.CaptureCallback() {
            @Override
            public void onSuccess(JSObject result) {
                call.resolve(result);
            }

            @Override
            public void onError(String message) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", message);
                call.resolve(ret);
            }

            @Override
            public void onProgress(int percent, String message) {
                JSObject ret = new JSObject();
                ret.put("type", "progress");
                ret.put("percent", percent);
                ret.put("message", message);
                notifyListeners("camera2:burstProgress", ret);
            }
        });
    }

    /**
     * Dark frame rögzítése (sötét expozíció, lencse lefedve).
     * Ugyanazokkal a beállításokkal mint a light frame, csak sötétben.
     */
    @PluginMethod
    public void captureDarkFrame(PluginCall call) {
        if (!ensureCameraPermission(call)) return;

        double exposureSeconds = call.getDouble("exposureSeconds", 1.0);
        int iso = call.getInt("iso", 800);
        String outputDir = call.getString("outputDir", "AstroSnap/dark");

        CameraSettings settings = new CameraSettings();
        settings.exposureSeconds = exposureSeconds;
        settings.iso = iso;
        settings.outputDir = outputDir;
        settings.frameType = "dark";
        settings.rawFormat = call.getBoolean("rawFormat", false);

        cameraManager.captureLongExposure(settings, new Camera2Manager.CaptureCallback() {
            @Override
            public void onSuccess(JSObject result) {
                call.resolve(result);
            }

            @Override
            public void onError(String message) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", message);
                call.resolve(ret);
            }

            @Override
            public void onProgress(int percent, String message) {
                // Dark frame capture progress
            }
        });
    }

    /**
     * Flat frame rögzítés (egyenletes megvilágítású kép a vignettálás és por foltok korrigálásához).
     */
    @PluginMethod
    public void captureFlatFrame(PluginCall call) {
        if (!ensureCameraPermission(call)) return;

        // Flat frame esetén rövid expozíció (1/30 - 1s), közepes ISO
        double exposureSeconds = call.getDouble("exposureSeconds", 0.5);
        int iso = call.getInt("iso", 200);
        String outputDir = call.getString("outputDir", "AstroSnap/flat");

        CameraSettings settings = new CameraSettings();
        settings.exposureSeconds = exposureSeconds;
        settings.iso = iso;
        settings.outputDir = outputDir;
        settings.frameType = "flat";

        cameraManager.captureLongExposure(settings, new Camera2Manager.CaptureCallback() {
            @Override
            public void onSuccess(JSObject result) {
                call.resolve(result);
            }

            @Override
            public void onError(String message) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", message);
                call.resolve(ret);
            }

            @Override
            public void onProgress(int percent, String message) {
                // Flat frame capture progress
            }
        });
    }

    /**
     * Bias frame rögzítés (legrövidebb expozíció, sötétben, a szenzor zajának mérésére).
     */
    @PluginMethod
    public void captureBiasFrame(PluginCall call) {
        if (!ensureCameraPermission(call)) return;

        int iso = call.getInt("iso", 800);
        String outputDir = call.getString("outputDir", "AstroSnap/bias");

        CameraSettings settings = new CameraSettings();
        settings.exposureSeconds = 1.0 / 8000.0; // a lehető legrövidebb
        settings.iso = iso;
        settings.outputDir = outputDir;
        settings.frameType = "bias";

        cameraManager.captureLongExposure(settings, new Camera2Manager.CaptureCallback() {
            @Override
            public void onSuccess(JSObject result) {
                call.resolve(result);
            }

            @Override
            public void onError(String message) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", message);
                call.resolve(ret);
            }

            @Override
            public void onProgress(int percent, String message) {
                // Bias frame capture progress
            }
        });
    }

    /**
     * Visszaadja a kamera képességeit (capabilities).
     * Ezt hívja a frontend, hogy megtudja mit támogat a telefon.
     *
     * Visszatérési érték:
     *   - success: boolean
     *   - capabilities: object
     *     - manualIsoSupported: boolean
     *     - manualExposureSupported: boolean
     *     - rawFormatSupported: boolean
     *     - manualFocusSupported: boolean
     *     - zoomSupported: boolean
     *     - maxZoom: float
     *     - sensorWidth: int
     *     - sensorHeight: int
     *     - maxExposureSeconds: double
     *     - minExposureSeconds: double
     */
    @PluginMethod
    public void getCapabilities(PluginCall call) {
        if (!ensureCameraPermission(call)) return;

        JSObject capabilities = cameraManager.getCapabilities();
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("capabilities", capabilities);
        call.resolve(ret);
    }

    /**
     * Manual vezérlők beállítása (élőben, capture nélkül).
     * Opciók: zoom, focusMode, focusDistance, iso, whiteBalanceK
     */
    @PluginMethod
    public void setManualControls(PluginCall call) {
        if (!ensureCameraPermission(call)) return;

        CameraSettings settings = new CameraSettings();
        settings.zoom = (float) call.getDouble("zoom", 1.0f);
        settings.focusMode = call.getString("focusMode", "auto");
        settings.focusDistance = (float) call.getDouble("focusDistance", 0.0f);
        settings.iso = call.getInt("iso", -1);
        settings.whiteBalanceK = call.getInt("whiteBalanceK", -1);

        cameraManager.applyManualControls(settings);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
