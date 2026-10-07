# AstroSnap – Natív Android Camera2 Plugin (Capacitor)

Ez a mappa tartalmazza a **Capacitor + natív Android Camera2 plugin** kódját, amit a meglévő PWA AstroSnap apphoz lehet hozzáadni. 

## A plugin képességei

- ✅ Valódi hosszú expozíció (1-30 másodperc, nem frame átlagolás!)
- ✅ RAW (DNG) formátum mentés
- ✅ Manual ISO (50-6400)
- ✅ Manual fókusz (fókusz távolság mm-ben)
- ✅ Manual fehérmérleg (Kelvin)
- ✅ Manual blende (ha támogatott)
- ✅ Burst sorozat (akár 100+ kép)
- ✅ Dark/Flat/Bias frame rögzítés
- ✅ EXIF metaadatok mentése

## Hogyan használd?

### 1. Előfeltételek

Számítógépedre telepíteni kell:
- **Node.js 18+** (https://nodejs.org)
- **Android Studio** (https://developer.android.com/studio)
- **Java JDK 17** (az Android Studio ezzel jön)

### 2. Capacitor projekt létrehozása

```bash
# Másold a meglévő Next.js appot egy új mappába
mkdir astrosnap-native
cd astrosnap-native

# Next.js build
npm install
npm run build

# Capacitor init
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init AstroSnap hu.astrosnap.app --web-dir=out

# Android hozzáadása
npx cap add android
```

### 3. Plugin telepítése

Másold az `android/app/src/main/java/hu/astrosnap/camera2/` mappát a Capacitor Android projektedbe.

Regisztráld a plugint az `android/app/src/main/java/hu/astrosnap/app/MainActivity.java` fájlban:

```java
package hu.astrosnap.app;

import com.getcapacitor.BridgeActivity;
import hu.astrosnap.camera2.Camera2Plugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(Camera2Plugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

### 4. AndroidManifest.xml jogosultságok

`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera2" android:required="true" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

### 5. Build és futtatás

```bash
# Web build
npm run build

# Sync Capacitor
npx cap sync android

# Android Studio megnyitása
npx cap open android

# Android Studióból: Run gomb
```

### 6. Használat a frontend-en

```typescript
import { Camera2Plugin } from 'hu.astrosnap.camera2';

// Hosszú expozíció képe
const result = await Camera2Plugin.captureLongExposure({
  exposureSeconds: 17.7,
  iso: 3200,
  whiteBalanceK: 4000,
  focusMode: 'infinity',
  rawFormat: true,  // DNG mentés
  outputDir: 'astrosnap/light'
});

console.log('Kép elmentve:', result.path);
```

## Fájlok

- `Camera2Plugin.java` – Fő plugin osztály
- `Camera2Manager.java` – Camera2 API kezelő
- `LongExposureCapture.java` – Hosszú expozíció logika
- `RawImageSaver.java` – DNG mentés
- `FrameProcessor.java` – Képkockák feldolgozása
- `CameraSettings.java` – Beállítások adatosztály
- `README.md` – Ez a fájl

## Kompatibilitás

- **Android 7.0+** (API 24+) – Camera2 API teljes támogatás
- **Android 10+** (API 29+) – RAW DNG formátum
- **Android 12+** (API 31+) – ÚjCameraX kompatibilitás (opcionális)

## Korlátok

- **Nem minden telefon támogatja a 30s+ expozíciót** – a telefon szenzorától függ
- **A manual fókuszálás pontossága eszközfüggő**
- **RAW formátum mentés több tárhelyet igényel** (10-30 MB/kép)

## Licenc

MIT – szabadon használható, módosítható.
