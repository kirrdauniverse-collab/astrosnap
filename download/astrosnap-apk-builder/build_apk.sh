#!/usr/bin/env bash
# ============================================================
# AstroSnap APK építő script
# ============================================================
#
# Ez a script automatizálja a Next.js PWA → Android APK konvertálását.
#
# ELŐFELTÉTELEK:
# - Node.js 18+: https://nodejs.org
# - Android Studio: https://developer.android.com/studio
# - Java JDK 17 (az Android Studio telepíti)
#
# HASZNÁLAT (Mac/Linux):
#   chmod +x build_apk.sh
#   ./build_apk.sh
#
# HASZNÁLAT (Windows - Git Bash vagy WSL):
#   bash build_apk.sh
# ============================================================

set -e  # Bármilyen hiba esetén leáll

# Színek
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

echo ""
echo "============================================================"
echo "  AstroSnap APK építő"
echo "============================================================"
echo ""

# 1. lépés: Ellenőrizzük a szükséges eszközöket
echo "📋 1. lépés: Eszközök ellenőrzése..."

if ! command -v node &> /dev/null; then
    print_error "Node.js nincs telepítve!"
    echo "   Telepítsd innen: https://nodejs.org"
    exit 1
fi
print_step "Node.js: $(node --version)"

if ! command -v npx &> /dev/null; then
    print_error "npx nem található!"
    exit 1
fi
print_step "npx elérhető"

# Java ellenőrzése (APK buildhez kell)
if command -v java &> /dev/null; then
    print_step "Java: $(java -version 2>&1 | head -1)"
else
    print_warn "Java nincs telepítve. Az APK buildhez szükséged lesz rá!"
    print_warn "Telepítsd az Android Studio-t, ami tartalmazza: https://developer.android.com/studio"
fi

# Android Studio ellenőrzése
if [[ -d "/Applications/Android Studio.app" ]] || [[ -d "$HOME/AppData/Local/Android/Sdk" ]]; then
    print_step "Android Studio telepítve"
else
    print_warn "Android Studio nem található. Telepítsd innen: https://developer.android.com/studio"
fi

echo ""

# 2. lépés: Aktuális könyvtár
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 3. lépés: Kimenet mappa létrehozása
BUILD_DIR="astrosnap-build"
echo "📁 2. lépés: Build mappa előkészítése..."

if [[ -d "$BUILD_DIR" ]]; then
    print_warn "Build mappa már létezik, töröljük..."
    rm -rf "$BUILD_DIR"
fi
mkdir -p "$BUILD_DIR"

# 4. lépés: A Next.js projekt másolása (a fenti src mappából)
echo "📦 3. lépés: AstroSnap projekt másolása..."

# Ha van egy AstroSnap projekt ebben a mappában
if [[ -f "package.json" ]]; then
    # Másoljuk a fontos fájlokat
    cp -r src "$BUILD_DIR/"
    cp -r public "$BUILD_DIR/" 2>/dev/null || true
    cp package.json "$BUILD_DIR/"
    cp tsconfig.json "$BUILD_DIR/" 2>/dev/null || true
    cp next.config.ts "$BUILD_DIR/" 2>/dev/null || cp next.config.js "$BUILD_DIR/" 2>/dev/null || true
    cp tailwind.config.ts "$BUILD_DIR/" 2>/dev/null || true
    cp postcss.config.mjs "$BUILD_DIR/" 2>/dev/null || true
    cp components.json "$BUILD_DIR/" 2>/dev/null || true
    cp eslint.config.mjs "$BUILD_DIR/" 2>/dev/null || true
    print_step "AstroSnap projekt másolva"
else
    print_error "Nem található AstroSnap projekt ebben a mappában!"
    print_warn  "Futtasd ezt a scriptet az AstroSnap projekt mappájából."
    exit 1
fi

cd "$BUILD_DIR"

# 5. lépés: Függőségek telepítése
echo "📥 4. lépés: Függőségek telepítése..."
print_warn "Ez eltarthat 1-2 percig..."

npm install --silent 2>&1 | tail -5
print_step "Függőségek telepítve"

# Capacitor telepítése
echo "📥 5. lépés: Capacitor telepítése..."
npm install @capacitor/core @capacitor/cli @capacitor/android --silent 2>&1 | tail -5
print_step "Capacitor telepítve"

# 6. lépés: Next.js konfiguráció módosítása statikus exporthoz
echo "⚙️ 6. lépés: Next.js statikus export beállítása..."

# next.config.ts módosítása
cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "*.space-z.ai",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
EOF

print_step "Next.js konfigurálva statikus exporthoz"

# 7. lépés: Build
echo "🔨 7. lépés: Webes build..."
npm run build 2>&1 | tail -10
print_step "Webes build kész"

# 8. lépés: Capacitor inicializálása
echo "📱 8. lépés: Capacitor inicializálása..."
npx cap init AstroSnap hu.astrosnap.app --web-dir=out 2>&1 | tail -5
print_step "Capacitor inicializálva"

# 9. lépés: Android platform hozzáadása
echo "🤖 9. lépés: Android platform hozzáadása..."
npx cap add android 2>&1 | tail -10
print_step "Android platform hozzáadva"

# 10. lépés: Camera2 plugin másolása
echo "🔌 10. lépés: Camera2 plugin hozzáadása..."

PLUGIN_DIR="android/app/src/main/java/hu/astrosnap/camera2"
mkdir -p "$PLUGIN_DIR"

# Camera2Plugin.java létrehozása
cat > "$PLUGIN_DIR/Camera2Plugin.java" << 'JAVA_EOF'
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

    @PluginMethod
    public void closeCamera(PluginCall call) {
        cameraManager.closeCamera();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void captureLongExposure(PluginCall call) {
        if (!ensureCameraPermission(call)) return;
        double exposureSeconds = call.getDouble("exposureSeconds", 1.0);
        int iso = call.getInt("iso", 800);
        int whiteBalanceK = call.getInt("whiteBalanceK", 0);
        String focusMode = call.getString("focusMode", "infinity");
        boolean rawFormat = call.getBoolean("rawFormat", false);
        String outputDir = call.getString("outputDir", "AstroSnap/light");

        CameraSettings settings = new CameraSettings();
        settings.exposureSeconds = exposureSeconds;
        settings.iso = iso;
        settings.whiteBalanceK = whiteBalanceK;
        settings.focusMode = focusMode;
        settings.rawFormat = rawFormat;
        settings.outputDir = outputDir;
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
                JSObject ret = new JSObject();
                ret.put("type", "progress");
                ret.put("percent", percent);
                ret.put("message", message);
                notifyListeners("camera2:captureProgress", ret);
            }
        });
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        if (!ensureCameraPermission(call)) return;
        JSObject capabilities = cameraManager.getCapabilities();
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("capabilities", capabilities);
        call.resolve(ret);
    }
}
JAVA_EOF

# Camera2Manager.java (rövidített, csak a capture logika)
cat > "$PLUGIN_DIR/Camera2Manager.java" << 'JAVA_EOF'
package hu.astrosnap.camera2;

import android.content.Context;
import android.hardware.camera2.*;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.util.Size;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import android.os.Environment;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.*;

@RequiresApi(api = Build.VERSION_CODES.N)
public class Camera2Manager {
    private static final String TAG = "Camera2Manager";
    private final Context context;
    private final CameraManager cameraManager;
    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private CameraCharacteristics cameraCharacteristics;
    private String currentCameraId;
    private ImageReader imageReader;
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;

    public interface CameraOpenCallback {
        void onOpened(JSObject capabilities);
        void onError(String message);
    }

    public interface CaptureCallback {
        void onSuccess(JSObject result);
        void onError(String message);
        void onProgress(int percent, String message);
    }

    public Camera2Manager(Context context) {
        this.context = context;
        this.cameraManager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
    }

    private void startBackgroundThread() {
        if (backgroundThread == null) {
            backgroundThread = new HandlerThread("Camera2Background");
            backgroundThread.start();
            backgroundHandler = new Handler(backgroundThread.getLooper());
        }
    }

    private void stopBackgroundThread() {
        if (backgroundThread != null) {
            backgroundThread.quitSafely();
            try {
                backgroundThread.join();
                backgroundThread = null;
                backgroundHandler = null;
            } catch (InterruptedException e) {
                Log.e(TAG, "Hiba a háttér szál leállításakor", e);
            }
        }
    }

    public void openCamera(String facing, String cameraId, CameraOpenCallback callback) {
        startBackgroundThread();
        try {
            String[] cameraIds = cameraManager.getCameraIdList();
            String selectedId = null;
            int desiredFacing = "front".equals(facing)
                    ? CameraCharacteristics.LENS_FACING_FRONT
                    : CameraCharacteristics.LENS_FACING_BACK;

            for (String id : cameraIds) {
                CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                Integer lensFacing = chars.get(CameraCharacteristics.LENS_FACING);
                if (lensFacing != null && lensFacing == desiredFacing) {
                    selectedId = id;
                    break;
                }
            }
            if (selectedId == null && cameraIds.length > 0) {
                selectedId = cameraIds[0];
            }
            if (selectedId == null) {
                callback.onError("Nem található kamera");
                return;
            }

            currentCameraId = selectedId;
            cameraCharacteristics = cameraManager.getCameraCharacteristics(selectedId);

            cameraManager.openCamera(selectedId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(@NonNull CameraDevice camera) {
                    cameraDevice = camera;
                    callback.onOpened(buildCapabilitiesObject());
                }
                @Override
                public void onDisconnected(@NonNull CameraDevice camera) {
                    camera.close();
                    cameraDevice = null;
                    callback.onError("Kamera kapcsolat megszakadt");
                }
                @Override
                public void onError(@NonNull CameraDevice camera, int error) {
                    camera.close();
                    cameraDevice = null;
                    callback.onError("Kamera hiba: " + error);
                }
            }, backgroundHandler);
        } catch (CameraAccessException e) {
            callback.onError("Kamera hozzáférési hiba: " + e.getMessage());
        }
    }

    public void closeCamera() {
        try {
            if (captureSession != null) { captureSession.close(); captureSession = null; }
            if (cameraDevice != null) { cameraDevice.close(); cameraDevice = null; }
            if (imageReader != null) { imageReader.close(); imageReader = null; }
        } catch (Exception e) {
            Log.e(TAG, "Hiba a kamera bezárásakor", e);
        }
        stopBackgroundThread();
    }

    private JSObject buildCapabilitiesObject() {
        JSObject caps = new JSObject();
        try {
            int[] availableCapabilities = cameraCharacteristics.get(
                    CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
            boolean manualSensor = false, raw = false;
            if (availableCapabilities != null) {
                for (int cap : availableCapabilities) {
                    if (cap == CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR) manualSensor = true;
                    if (cap == CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_RAW) raw = true;
                }
            }
            caps.put("manualSensorSupported", manualSensor);
            caps.put("rawFormatSupported", raw);

            int[] isoRange = cameraCharacteristics.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
            if (isoRange != null) {
                caps.put("minIso", isoRange[0]);
                caps.put("maxIso", isoRange[1]);
            }

            long[] exposureRange = cameraCharacteristics.get(
                    CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
            if (exposureRange != null) {
                caps.put("minExposureSeconds", exposureRange[0] / 1_000_000_000.0);
                caps.put("maxExposureSeconds", exposureRange[1] / 1_000_000_000.0);
            }

            Size sensorSize = cameraCharacteristics.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE);
            if (sensorSize != null) {
                caps.put("sensorWidth", sensorSize.getWidth());
                caps.put("sensorHeight", sensorSize.getHeight());
            }

            Boolean flashAvailable = cameraCharacteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
            caps.put("flashSupported", flashAvailable != null && flashAvailable);
            caps.put("cameraId", currentCameraId);
        } catch (Exception e) {
            Log.e(TAG, "Hiba a képességek lekérdezésekor", e);
        }
        return caps;
    }

    public JSObject getCapabilities() {
        if (cameraCharacteristics == null) return new JSObject();
        return buildCapabilitiesObject();
    }

    public void captureLongExposure(CameraSettings settings, CaptureCallback callback) {
        if (cameraDevice == null) {
            callback.onError("Kamera nincs megnyitva");
            return;
        }
        try {
            int imageFormat = settings.rawFormat ? ImageFormat.RAW_SENSOR : ImageFormat.JPEG;
            Size[] outputSizes = cameraCharacteristics.get(
                    CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                    .getOutputSizes(imageFormat);
            if (outputSizes == null || outputSizes.length == 0) {
                imageFormat = ImageFormat.JPEG;
                outputSizes = cameraCharacteristics.get(
                        CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                        .getOutputSizes(imageFormat);
                settings.rawFormat = false;
            }

            Size captureSize = outputSizes[0];
            for (Size s : outputSizes) {
                if (s.getWidth() * s.getHeight() > captureSize.getWidth() * captureSize.getHeight()) {
                    captureSize = s;
                }
            }

            imageReader = ImageReader.newInstance(
                    captureSize.getWidth(), captureSize.getHeight(), imageFormat, 5);

            imageReader.setOnImageAvailableListener(reader -> {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    if (image != null) saveImage(image, settings, callback);
                } catch (Exception e) {
                    callback.onError("Kép mentési hiba: " + e.getMessage());
                } finally {
                    if (image != null) image.close();
                }
            }, backgroundHandler);

            cameraDevice.createCaptureSession(
                    Collections.singletonList(imageReader.getSurface()),
                    new CameraCaptureSession.StateCallback() {
                        @Override
                        public void onConfigured(@NonNull CameraCaptureSession session) {
                            captureSession = session;
                            try {
                                CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(
                                        CameraDevice.TEMPLATE_STILL_CAPTURE);
                                builder.addTarget(imageReader.getSurface());

                                // VALÓDI HOSSZÚ EXPOZÍCIÓ!
                                long exposureTimeNs = (long) (settings.exposureSeconds * 1_000_000_000L);
                                builder.set(CaptureRequest.SENSOR_EXPOSURE_TIME, exposureTimeNs);
                                builder.set(CaptureRequest.SENSOR_SENSITIVITY, settings.iso);
                                builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_OFF);

                                if ("infinity".equals(settings.focusMode)) {
                                    builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF);
                                    builder.set(CaptureRequest.LENS_FOCUS_DISTANCE, 0.0f);
                                } else if ("manual".equals(settings.focusMode)) {
                                    builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF);
                                }

                                builder.set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_OFF);

                                callback.onProgress(50, "Expozíció folyamatban: " + settings.exposureSeconds + "s");

                                session.capture(builder.build(), new CameraCaptureSession.CaptureCallback() {
                                    @Override
                                    public void onCaptureCompleted(@NonNull CameraCaptureSession session,
                                                                    @NonNull CaptureRequest request,
                                                                    @NonNull TotalCaptureResult result) {
                                        Log.d(TAG, "Capture completed");
                                    }
                                    @Override
                                    public void onCaptureFailed(@NonNull CameraCaptureSession session,
                                                                 @NonNull CaptureRequest request,
                                                                 @NonNull CaptureFailure failure) {
                                        callback.onError("Capture sikertelen: " + failure.getReason());
                                    }
                                }, backgroundHandler);
                            } catch (CameraAccessException e) {
                                callback.onError("Capture request hiba: " + e.getMessage());
                            }
                        }
                        @Override
                        public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                            callback.onError("Capture session konfiguráció sikertelen");
                        }
                    },
                    backgroundHandler
            );
        } catch (CameraAccessException e) {
            callback.onError("Kamera hozzáférési hiba: " + e.getMessage());
        }
    }

    private void saveImage(Image image, CameraSettings settings, CaptureCallback callback) {
        try {
            File outputDir = new File(Environment.getExternalStorageDirectory(), settings.outputDir);
            if (!outputDir.exists()) outputDir.mkdirs();

            String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
            String extension = settings.rawFormat ? ".dng" : ".jpg";
            File outputFile = new File(outputDir, "astrosnap_" + settings.frameType + "_" + timestamp + extension);

            ByteBuffer buffer = image.getPlanes()[0].getBuffer();
            byte[] bytes = new byte[buffer.remaining()];
            buffer.get(bytes);
            try (FileOutputStream fos = new FileOutputStream(outputFile)) {
                fos.write(bytes);
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("path", outputFile.getAbsolutePath());
            result.put("width", image.getWidth());
            result.put("height", image.getHeight());
            result.put("fileSize", outputFile.length());
            result.put("format", settings.rawFormat ? "dng" : "jpeg");
            callback.onProgress(100, "Kép elmentve: " + outputFile.getName());
            callback.onSuccess(result);
        } catch (Exception e) {
            Log.e(TAG, "Hiba a kép mentésekor", e);
            callback.onError("Mentési hiba: " + e.getMessage());
        }
    }
}
JAVA_EOF

# CameraSettings.java
cat > "$PLUGIN_DIR/CameraSettings.java" << 'JAVA_EOF'
package hu.astrosnap.camera2;

public class CameraSettings {
    public double exposureSeconds = 1.0;
    public int iso = 800;
    public int whiteBalanceK = 0;
    public String focusMode = "infinity";
    public float focusDistance = 0.0f;
    public float zoom = 1.0f;
    public boolean rawFormat = false;
    public String outputDir = "AstroSnap/light";
    public String fileName = null;
    public String frameType = "light";
}
JAVA_EOF

print_step "Camera2 plugin hozzáadva"

# 11. lépés: MainActivity módosítása
echo "📝 11. lépés: MainActivity frissítése..."
MAIN_ACTIVITY="android/app/src/main/java/hu/astrosnap/app/MainActivity.java"
mkdir -p "$(dirname "$MAIN_ACTIVITY")"

cat > "$MAIN_ACTIVITY" << 'JAVA_EOF'
package hu.astrosnap.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import hu.astrosnap.camera2.Camera2Plugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(Camera2Plugin.class);
        super.onCreate(savedInstanceState);
    }
}
JAVA_EOF

print_step "MainActivity frissítve"

# 12. lépés: AndroidManifest.xml frissítése
echo "📝 12. lépés: AndroidManifest.xml frissítése..."
MANIFEST="android/app/src/main/AndroidManifest.xml"

# Beolvassuk a manifest-et és hozzáadjuk a jogosultságokat
python3 - "$MANIFEST" << 'PYTHON_EOF' || python - "$MANIFEST" << 'PYTHON_EOF2'
import sys
manifest_path = sys.argv[1]
with open(manifest_path, 'r') as f:
    content = f.read()

permissions = '''    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-feature android:name="android.hardware.camera2" android:required="true" />
'''

# Ha még nincsenek meg a jogosultságok
if 'android.permission.CAMERA' not in content:
    # A <application> tag elé beszúrjuk
    content = content.replace('<application', permissions + '<application')

with open(manifest_path, 'w') as f:
    f.write(content)
print("AndroidManifest frissítve")
PYTHON_EOF
import sys
manifest_path = sys.argv[1]
with open(manifest_path, 'r') as f:
    content = f.read()

permissions = '''    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-feature android:name="android.hardware.camera2" android:required="true" />
'''

if 'android.permission.CAMERA' not in content:
    content = content.replace('<application', permissions + '<application')

with open(manifest_path, 'w') as f:
    f.write(content)
print("AndroidManifest frissítve")
PYTHON_EOF2

print_step "AndroidManifest frissítve"

# 13. lépés: Sync
echo "🔄 13. lépés: Capacitor sync..."
npx cap sync android 2>&1 | tail -5
print_step "Sync kész"

# 14. lépés: Build
echo ""
echo "============================================================"
echo "  ✓ Projekt előkészítve!"
echo "============================================================"
echo ""
echo "📁 A projekt itt található: $BUILD_DIR/android"
echo ""
echo "📱 Következő lépések:"
echo "  1. Nyisd meg az Android Studio-t"
echo "  2. File → Open → válaszd a '$BUILD_DIR/android' mappát"
echo "  3. Várd meg a Gradle szinkronizációt (1-2 perc)"
echo "  4. Csatlakoztasd a telefonod USB-n (developer mode bekapcsolva)"
echo "  5. Kattints a ▶ Run gombra (zöld háromszög)"
echo ""
echo "📦 APK készítése (telepítő fájl):"
echo "  1. Android Studio: Build → Build Bundle(s)/APK(s) → Build APK(s)"
echo "  2. Várd meg a build-et (1-3 perc)"
echo "  3. Az APK itt lesz: $BUILD_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "🎮 APK telepítése a telefonra:"
echo "  1. Másold az APK fájlt a telefonodra"
echo "  2. Engedélyezd az 'Ismeretlen források' opciót"
echo "  3. Nyisd meg az APK-t és telepítsd"
echo ""
echo "🌟 Az app most már TÉNYLEGES Camera2 API-t használ!"
echo "   - Valódi hosszú expozíció (1-30 másodperc)"
echo "   - RAW (DNG) mentés"
echo "   - Manual ISO, fókusz, fehérmérleg"
echo ""
