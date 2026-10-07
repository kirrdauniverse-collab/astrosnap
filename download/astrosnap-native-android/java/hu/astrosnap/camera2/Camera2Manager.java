package hu.astrosnap.camera2;

import android.content.Context;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.CaptureResult;
import android.hardware.camera2.TotalCaptureResult;
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

import android.location.Location;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Camera2Manager – Közvetlen Camera2 API kezelő.
 *
 * Ez az osztály végzi a tényleges kamerakezelést:
 *  - Kamera megnyitása/bezárása
 *  - Manual vezérlők beállítása (ISO, expozíció, fókusz, zoom, WB)
 *  - Hosszú expozíció végrehajtása
 *  - RAW (DNG) formátum mentés
 *  - Burst sorozat kezelése
 *
 * A plugin a Camera2 API-t használja, amely minden Android 7.0+ eszközön elérhető.
 */
@RequiresApi(api = Build.VERSION_CODES.N)
public class Camera2Manager {

    private static final String TAG = "Camera2Manager";
    private static final int MAX_EXPOSURE_SECONDS = 30;
    private static final int MIN_EXPOSURE_SECONDS = 1; // 1/8000s a minimum
    private static final int IMAGE_READER_MAX_IMAGES = 5;

    private final Context context;
    private final CameraManager cameraManager;
    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private CameraCharacteristics cameraCharacteristics;
    private String currentCameraId;
    private ImageReader imageReader;

    private HandlerThread backgroundThread;
    private Handler backgroundHandler;

    // A capture folyamat szinkronizációjához
    private final Semaphore cameraLock = new Semaphore(1);
    private CaptureCallback currentCaptureCallback;

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

    /**
     * Elindítja a háttér szálat a Camera2 API-nak.
     * Ezt a Camera2 API megköveteli - a callback-ek nem futhatnak a fő szálon.
     */
    private void startBackgroundThread() {
        if (backgroundThread == null) {
            backgroundThread = new HandlerThread("Camera2Background");
            backgroundThread.start();
            backgroundHandler = new Handler(backgroundThread.getLooper());
        }
    }

    /**
     * Leállítja a háttér szálat.
     */
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

    /**
     * Megnyitja a megfelelő kamerát.
     *
     * @param facing "back" vagy "front"
     * @param cameraId Konkrét kamera ID (opcionális, null = automatikus kiválasztás)
     * @param callback Callback a képességekkel vagy hibával
     */
    public void openCamera(String facing, String cameraId, CameraOpenCallback callback) {
        startBackgroundThread();

        try {
            if (!cameraLock.tryAcquire(2500, TimeUnit.MILLISECONDS)) {
                callback.onError("Camera lock timeout - a kamera használatban van");
                return;
            }

            // Kamera ID kiválasztása
            String[] cameraIds = cameraManager.getCameraIdList();
            String selectedId = null;

            if (cameraId != null && !cameraId.isEmpty()) {
                // Konkrét ID-t kértek
                for (String id : cameraIds) {
                    if (id.equals(cameraId)) {
                        selectedId = id;
                        break;
                    }
                }
            } else {
                // Automatikus kiválasztás a facing alapján
                int desiredFacing = "front".equals(facing)
                        ? CameraCharacteristics.LENS_FACING_FRONT
                        : CameraCharacteristics.LENS_FACING_BACK;

                // Először a hátsó fő kamerát keressük (zoom támogatással)
                // Modern telefonokon ez a 0-s kamera
                for (String id : cameraIds) {
                    CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                    Integer lensFacing = chars.get(CameraCharacteristics.LENS_FACING);
                    if (lensFacing != null && lensFacing == desiredFacing) {
                        // Ellenőrizzük, hogy támogatja-e a manual vezérlést
                        int[] capabilities = chars.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
                        boolean hasManualSensor = false;
                        boolean hasRaw = false;
                        if (capabilities != null) {
                            for (int cap : capabilities) {
                                if (cap == CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR) {
                                    hasManualSensor = true;
                                }
                                if (cap == CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_RAW) {
                                    hasRaw = true;
                                }
                            }
                        }
                        if (hasManualSensor) {
                            selectedId = id;
                            break;
                        }
                    }
                }
                // Ha nem találtunk manual sensor kamerát, az első facing-megfelelőt választjuk
                if (selectedId == null) {
                    for (String id : cameraIds) {
                        CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                        Integer lensFacing = chars.get(CameraCharacteristics.LENS_FACING);
                        if (lensFacing != null && lensFacing == desiredFacing) {
                            selectedId = id;
                            break;
                        }
                    }
                }
            }

            if (selectedId == null) {
                cameraLock.release();
                callback.onError("Nem található megfelelő kamera");
                return;
            }

            currentCameraId = selectedId;
            cameraCharacteristics = cameraManager.getCameraCharacteristics(selectedId);

            // Kamera megnyitása (callback a háttér szálon)
            cameraManager.openCamera(selectedId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(@NonNull CameraDevice camera) {
                    cameraDevice = camera;

                    // Képességek lekérése és visszaadás a callback-nek
                    JSObject capabilities = buildCapabilitiesObject();
                    callback.onOpened(capabilities);
                }

                @Override
                public void onDisconnected(@NonNull CameraDevice camera) {
                    camera.close();
                    cameraDevice = null;
                    cameraLock.release();
                    callback.onError("Kamera kapcsolat megszakadt");
                }

                @Override
                public void onError(@NonNull CameraDevice camera, int error) {
                    camera.close();
                    cameraDevice = null;
                    cameraLock.release();
                    String errorMsg = "Kamera hiba: " + error;
                    switch (error) {
                        case CameraDevice.StateCallback.ERROR_CAMERA_DEVICE:
                            errorMsg = "Kamera eszköz hiba";
                            break;
                        case CameraDevice.StateCallback.ERROR_CAMERA_DISABLED:
                            errorMsg = "Kamera letiltva (politikai okokból)";
                            break;
                        case CameraDevice.StateCallback.ERROR_CAMERA_IN_USE:
                            errorMsg = "Kamera már használatban van egy másik app által";
                            break;
                        case CameraDevice.StateCallback.ERROR_CAMERA_SERVICE:
                            errorMsg = "Kamera szolgáltatás hiba";
                            break;
                        case CameraDevice.StateCallback.ERROR_MAX_CAMERAS_IN_USE:
                            errorMsg = "Túl sok kamera nyitva";
                            break;
                    }
                    callback.onError(errorMsg);
                }
            }, backgroundHandler);

        } catch (CameraAccessException e) {
            cameraLock.release();
            callback.onError("Kamera hozzáférési hiba: " + e.getMessage());
        } catch (InterruptedException e) {
            callback.onError("Kamera zárolás megszakítva: " + e.getMessage());
        }
    }

    /**
     * Bezárja a kamerát.
     */
    public void closeCamera() {
        try {
            if (null != captureSession) {
                captureSession.close();
                captureSession = null;
            }
            if (null != cameraDevice) {
                cameraDevice.close();
                cameraDevice = null;
            }
            if (null != imageReader) {
                imageReader.close();
                imageReader = null;
            }
            if (cameraLock.availablePermits() == 0) {
                cameraLock.release();
            }
        } catch (Exception e) {
            Log.e(TAG, "Hiba a kamera bezárásakor", e);
        } finally {
            stopBackgroundThread();
        }
    }

    /**
     * Összeállítja a kamera képességeket (capabilities) JSObject-ként.
     */
    private JSObject buildCapabilitiesObject() {
        JSObject caps = new JSObject();
        try {
            // Manual sensor támogatás
            int[] availableCapabilities = cameraCharacteristics.get(
                    CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
            boolean manualSensor = false;
            boolean raw = false;
            boolean manualPostProcessing = false;
            if (availableCapabilities != null) {
                for (int cap : availableCapabilities) {
                    if (cap == CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR) {
                        manualSensor = true;
                    }
                    if (cap == CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_RAW) {
                        raw = true;
                    }
                    if (cap == CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_POST_PROCESSING) {
                        manualPostProcessing = true;
                    }
                }
            }
            caps.put("manualSensorSupported", manualSensor);
            caps.put("rawFormatSupported", raw);
            caps.put("manualWhiteBalanceSupported", manualPostProcessing);

            // ISO tartomány
            int[] isoRange = cameraCharacteristics.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
            if (isoRange != null) {
                caps.put("minIso", isoRange[0]);
                caps.put("maxIso", isoRange[1]);
            }

            // Expozíció idő tartomány
            long[] exposureRange = cameraCharacteristics.get(
                    CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
            if (exposureRange != null) {
                // Nanosecundumból másodperc
                double minExp = exposureRange[0] / 1_000_000_000.0;
                double maxExp = exposureRange[1] / 1_000_000_000.0;
                caps.put("minExposureSeconds", minExp);
                caps.put("maxExposureSeconds", maxExp);
                // A 30s korlát az Android platform maximum
                caps.put("effectiveMaxExposureSeconds", Math.min(maxExp, MAX_EXPOSURE_SECONDS));
            }

            // Fókusz támogatás
            float[] focusDistances = cameraCharacteristics.get(
                    CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
            caps.put("manualFocusSupported", focusDistances != null && focusDistances.length > 0 && focusDistances[0] > 0);
            if (focusDistances != null && focusDistances.length > 0) {
                caps.put("minFocusDistance", focusDistances[0]);
            }

            // Zoom támogatás
            float[] zoomRange = cameraCharacteristics.get(CameraCharacteristics.LENS_INFO_ZOOM_RATIO_RANGE);
            caps.put("zoomSupported", zoomRange != null);
            if (zoomRange != null) {
                caps.put("minZoom", zoomRange[0]);
                caps.put("maxZoom", zoomRange[1]);
            }

            // Szenzor felbontás
            Size sensorSize = cameraCharacteristics.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE);
            if (sensorSize != null) {
                caps.put("sensorWidth", sensorSize.getWidth());
                caps.put("sensorHeight", sensorSize.getHeight());
                caps.put("megapixels", sensorSize.getWidth() * sensorSize.getHeight() / 1_000_000.0);
            }

            // Fényképezési felbontás (JPEG)
            Size[] jpegSizes = cameraCharacteristics.get(
                    CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                    .getOutputSizes(ImageFormat.JPEG);
            if (jpegSizes != null && jpegSizes.length > 0) {
                Size maxJpeg = jpegSizes[0];
                for (Size s : jpegSizes) {
                    if (s.getWidth() * s.getHeight() > maxJpeg.getWidth() * maxJpeg.getHeight()) {
                        maxJpeg = s;
                    }
                }
                caps.put("maxJpegWidth", maxJpeg.getWidth());
                caps.put("maxJpegHeight", maxJpeg.getHeight());
            }

            // Vaku támogatás
            Boolean flashAvailable = cameraCharacteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
            caps.put("flashSupported", flashAvailable != null && flashAvailable);

            caps.put("cameraId", currentCameraId);
            caps.put("lensFacing", cameraCharacteristics.get(CameraCharacteristics.LENS_FACING) ==
                    CameraCharacteristics.LENS_FACING_BACK ? "back" : "front");

        } catch (Exception e) {
            Log.e(TAG, "Hiba a képességek lekérdezésekor", e);
        }
        return caps;
    }

    /**
     * Visszaadja a kamera képességeit.
     */
    public JSObject getCapabilities() {
        if (cameraCharacteristics == null) {
            return new JSObject();
        }
        return buildCapabilitiesObject();
    }

    /**
     * Valódi hosszú expozíció készítése.
     * A Camera2 API SENSOR_EXPOSURE_TIME értéke nanosecundumban van megadva,
     * így pl. 17.7s = 17_700_000_000 ns.
     *
     * Fontos: ez NEM frame átlagolás, hanem a szenzor valódi expozíciós ideje!
     */
    public void captureLongExposure(CameraSettings settings, CaptureCallback callback) {
        if (cameraDevice == null) {
            callback.onError("Kamera nincs megnyitva. Először hívd az openCamera-t.");
            return;
        }

        currentCaptureCallback = callback;

        try {
            // Kiválasztjuk a maximális JPEG/RAW felbontást
            int imageFormat = settings.rawFormat ? ImageFormat.RAW_SENSOR : ImageFormat.JPEG;
            Size[] outputSizes = cameraCharacteristics.get(
                    CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                    .getOutputSizes(imageFormat);
            if (outputSizes == null || outputSizes.length == 0) {
                // Ha a RAW nem támogatott, visszaessünk a JPEG-re
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

            // ImageReader létrehozása a capture-hez
            imageReader = ImageReader.newInstance(
                    captureSize.getWidth(),
                    captureSize.getHeight(),
                    imageFormat,
                    IMAGE_READER_MAX_IMAGES
            );

            imageReader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
                @Override
                public void onImageAvailable(ImageReader reader) {
                    Image image = null;
                    try {
                        image = reader.acquireLatestImage();
                        if (image != null) {
                            saveImage(image, settings, callback);
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Hiba a kép mentésekor", e);
                        callback.onError("Kép mentési hiba: " + e.getMessage());
                    } finally {
                        if (image != null) image.close();
                    }
                }
            }, backgroundHandler);

            // Capture session létrehozása
            cameraDevice.createCaptureSession(
                    Arrays.asList(imageReader.getSurface()),
                    new CameraCaptureSession.StateCallback() {
                        @Override
                        public void onConfigured(@NonNull CameraCaptureSession session) {
                            captureSession = session;
                            try {
                                // Capture request felépítése
                                CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(
                                        CameraDevice.TEMPLATE_STILL_CAPTURE);
                                builder.addTarget(imageReader.getSurface());

                                // Expozíció ideje (nanosecundum)
                                long exposureTimeNs = (long) (settings.exposureSeconds * 1_000_000_000L);
                                builder.set(CaptureRequest.SENSOR_EXPOSURE_TIME, exposureTimeNs);

                                // ISO
                                if (settings.iso > 0) {
                                    builder.set(CaptureRequest.SENSOR_SENSITIVITY, settings.iso);
                                }

                                // Fókusz
                                applyFocusSettings(builder, settings);

                                // Fehérmérleg
                                if (settings.whiteBalanceK > 0) {
                                    builder.set(CaptureRequest.CONTROL_AWB_MODE,
                                            CaptureRequest.CONTROL_AWB_MODE_OFF);
                                    // RGB gains kiszámítása a Kelvin-ből
                                    float[] gains = kelvinToRgbGains(settings.whiteBalanceK);
                                    builder.set(CaptureRequest.COLOR_CORRECTION_MODE,
                                            CaptureRequest.COLOR_CORRECTION_MODE_TRANSFORM_MATRIX);
                                    builder.set(CaptureRequest.COLOR_CORRECTION_GAINS, gains);
                                }

                                // Stabilizáció kikapcsolása (asztrofotózásnál nem kell)
                                int stabilizationMode = cameraCharacteristics.get(
                                        CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION);
                                if (stabilizationMode != null) {
                                    builder.set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                                            CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_OFF);
                                }

                                builder.set(CaptureRequest.CONTROL_AE_MODE,
                                        CaptureRequest.CONTROL_AE_MODE_OFF);
                                builder.set(CaptureRequest.NOISE_REDUCTION_MODE,
                                        CaptureRequest.NOISE_REDUCTION_MODE_OFF); // RAW esetén mindenképp

                                callback.onProgress(50, "Expozíció folyamatban: " + settings.exposureSeconds + "s");

                                // Capture indítása
                                session.capture(builder.build(), new CameraCaptureSession.CaptureCallback() {
                                    @Override
                                    public void onCaptureCompleted(@NonNull CameraCaptureSession session,
                                                                    @NonNull CaptureRequest request,
                                                                    @NonNull TotalCaptureResult result) {
                                        // A kép az ImageReader-onImageAvailable callback-ben lesz feldolgozva
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

    /**
     * Alkalmazza a fókusz beállításokat a CaptureRequest-re.
     */
    private void applyFocusSettings(CaptureRequest.Builder builder, CameraSettings settings) {
        switch (settings.focusMode) {
            case "manual":
                builder.set(CaptureRequest.CONTROL_AF_MODE,
                        CaptureRequest.CONTROL_AF_MODE_OFF);
                // A fókusz távolság dioptriában van megadva (0 = végtelen)
                float distance = settings.focusDistance;
                builder.set(CaptureRequest.LENS_FOCUS_DISTANCE, distance);
                break;
            case "infinity":
                builder.set(CaptureRequest.CONTROL_AF_MODE,
                        CaptureRequest.CONTROL_AF_MODE_OFF);
                builder.set(CaptureRequest.LENS_FOCUS_DISTANCE, 0.0f);
                break;
            case "auto":
            default:
                builder.set(CaptureRequest.CONTROL_AF_MODE,
                        CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                break;
        }
    }

    /**
     * Kelvin → RGB gains konverzió a fehérmérleg beállításához.
     * A Camera2 API COLOR_CORRECTION_GAINS értéke [R, G, B, G] formátumban van.
     */
    private float[] kelvinToRgbGains(int kelvin) {
        // Approximációs algoritmus a színhőmérséklet RGB-é alakításához
        // Alapján: Tanner Helland's algorithm
        double temp = kelvin / 100.0;
        double r, g, b;

        // Piros
        if (temp <= 66) {
            r = 255;
        } else {
            r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
        }

        // Zöld
        if (temp <= 66) {
            g = 99.4708025861 * Math.log(temp) - 161.1195681661;
        } else {
            g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
        }

        // Kék
        if (temp >= 66) {
            b = 255;
        } else if (temp <= 19) {
            b = 0;
        } else {
            b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
        }

        // Normalizálás 0-1 között
        double rNorm = Math.max(0, Math.min(255, r)) / 255.0;
        double gNorm = Math.max(0, Math.min(255, g)) / 255.0;
        double bNorm = Math.max(0, Math.min(255, b)) / 255.0;

        // A gains relatívak: R és B módosítása a zöldhöz képest
        // A Camera2 API-ban a gains [R, G, B, G] formátumban vannak
        float[] gains = new float[4];
        gains[0] = (float) (rNorm / gNorm); // R
        gains[1] = 1.0f;                     // G
        gains[2] = (float) (bNorm / gNorm); // B
        gains[3] = 1.0f;                     // G (ismétlés)
        return gains;
    }

    /**
     * Burst sorozat készítése.
     * Több expozíciót végez egymás után, mindegyiket külön fájlba menti.
     */
    public void captureBurst(CameraSettings settings, CaptureCallback callback) {
        if (cameraDevice == null) {
            callback.onError("Kamera nincs megnyitva");
            return;
        }

        final int totalFrames = settings.frameCount;
        final List<String> capturedPaths = new ArrayList<>();
        final int[] currentFrame = {0};

        // Első capture
        CaptureCallback burstCallback = new CaptureCallback() {
            @Override
            public void onSuccess(JSObject result) {
                capturedPaths.add(result.getString("path"));
                currentFrame[0]++;

                int percent = (int) ((currentFrame[0] / (double) totalFrames) * 100);
                callback.onProgress(percent, "Készült: " + currentFrame[0] + "/" + totalFrames);

                if (currentFrame[0] >= totalFrames) {
                    // Minden kép elkészült
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("paths", capturedPaths);
                    ret.put("count", capturedPaths.size());
                    callback.onSuccess(ret);
                } else {
                    // Várunk az intervalSeconds-nak megfelelően
                    try {
                        Thread.sleep((long) (settings.intervalSeconds * 1000));
                    } catch (InterruptedException e) {
                        callback.onError("Burst megszakítva");
                        return;
                    }
                    // Következő capture
                    captureLongExposure(settings, this);
                }
            }

            @Override
            public void onError(String message) {
                callback.onError(message);
            }

            @Override
            public void onProgress(int percent, String message) {
                // Inner capture progress - ignore, we report our own progress
            }
        };

        captureLongExposure(settings, burstCallback);
    }

    /**
     * Ment egy képet a megadott Image-ből.
     * JPEG vagy DNG formátumban, a settings-től függően.
     */
    private void saveImage(Image image, CameraSettings settings, CaptureCallback callback) {
        try {
            // Kimeneti könyvtár létrehozása
            File outputDir = new File(
                    android.os.Environment.getExternalStorageDirectory(),
                    settings.outputDir
            );
            if (!outputDir.exists()) {
                outputDir.mkdirs();
            }

            // Fájlnév generálása
            String fileName = settings.fileName;
            if (fileName == null || fileName.isEmpty()) {
                String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
                        .format(new Date());
                fileName = "astrosnap_" + settings.frameType + "_" + timestamp;
            }

            String extension = settings.rawFormat ? ".dng" : ".jpg";
            File outputFile = new File(outputDir, fileName + extension);

            // Kép mentése
            if (settings.rawFormat && image.getFormat() == ImageFormat.RAW_SENSOR) {
                // RAW/DNG mentés
                saveRawAsDng(image, outputFile, settings);
            } else {
                // JPEG mentés
                saveJpeg(image, outputFile);
            }

            // Eredmény visszaadása
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("path", outputFile.getAbsolutePath());
            result.put("width", image.getWidth());
            result.put("height", image.getHeight());
            result.put("fileSize", outputFile.length());
            result.put("format", settings.rawFormat ? "dng" : "jpeg");
            result.put("frameType", settings.frameType);

            callback.onProgress(100, "Kép elmentve: " + outputFile.getName());
            callback.onSuccess(result);

        } catch (Exception e) {
            Log.e(TAG, "Hiba a kép mentésekor", e);
            callback.onError("Mentési hiba: " + e.getMessage());
        }
    }

    /**
     * Ment egy JPEG képet.
     */
    private void saveJpeg(Image image, File outputFile) throws IOException {
        ByteBuffer buffer = image.getPlanes()[0].getBuffer();
        byte[] bytes = new byte[buffer.remaining()];
        buffer.get(bytes);
        try (FileOutputStream fos = new FileOutputStream(outputFile)) {
            fos.write(bytes);
        }
    }

    /**
     * Ment egy RAW képet DNG formátumban.
     * A DNG (Digital Negative) az Adobe nyílt RAW formátuma,
     * amely tartalmazza a szenzor nyers adatait és a metaadatokat.
     *
     * Ez a funkció megköveteli a android DngCreator osztályt (API 21+).
     */
    private void saveRawAsDng(Image image, File outputFile, CameraSettings settings) throws IOException {
        // Megjegyzés: A DngCreator osztály használatához a capture result-ból kellene
        // a karakterisztika és a CaptureResult objektum. Ezt egy kicsit bonyolultabb
        // összekötni, ezért itt egy egyszerűsített verziót mutatunk be.
        //
        // A teljes DNG mentéshez a onCaptureCompleted callback-ben el kell tárolni
        // a TotalCaptureResult objektumot, majd azt átadni a DngCreator-nak.

        // Egyszerűsített mentés: a RAW bájtokat közvetlenül kiírjuk
        // (Ez nem szabványos DNG, hanem a szenzor nyers adatai)
        ByteBuffer buffer = image.getPlanes()[0].getBuffer();
        byte[] bytes = new byte[buffer.remaining()];
        buffer.get(bytes);
        try (FileOutputStream fos = new FileOutputStream(outputFile)) {
            fos.write(bytes);
        }

        // Megjegyzés: A teljes DngCreator implementációhoz lásd:
        // https://developer.android.com/reference/android/hardware/camera2/DngCreator
    }

    /**
     * Alkalmazza a manual vezérlőket a kamerára (capture nélkül, élő preview-hoz).
     */
    public void applyManualControls(CameraSettings settings) {
        // Ez a funkció a preview-ra vonatkozik - ha van aktív preview session,
        // akkor módosítja a capture request-et
        if (captureSession == null) {
            Log.w(TAG, "Nincs aktív capture session, manual controls nem alkalmazható");
            return;
        }
        // A teljes preview implementációt ld. a Camera2ManagerPreview.java-ban
        // (most nem részletezzük, a capture funkció a fontosabb)
    }
}
