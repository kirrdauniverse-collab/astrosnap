# AstroSnap – Natív Android Build Útmutató

## Áttekintés

Ez a dokumentum elmagyarázza, hogyan építs natív Android APK-t a meglévő AstroSnap PWA-ból, Camera2 API pluginnel.

## Fontos tudnivalók

### Mit kap a natív verzióval?

- ✅ **Valódi hosszú expozíció** (1-30 másodperc, nem frame átlagolás!)
- ✅ **RAW (DNG) formátum** mentés
- ✅ **Manual ISO** (50-6400, ha a telefon támogatja)
- ✅ **Manual fókusz** és fókusz távolság beállítás
- ✅ **Manual fehérmérleg** Kelvin-ben
- ✅ **Burst sorozat** akár 100+ kép
- ✅ **EXIF metaadatok** teljes elmentése
- ✅ **Szenzor felbontás** használata (nem a video stream korlátozása)

### Mit nem tud a natív verzió?

- ❌ iOS-re nem fut (külön Swift implementáció kellene)
- ❌ A régebbi Androidok (6.0 és korábbi) nem támogatják a Camera2 API-t
- ❌ Nem minden telefon támogatja a 30s expozíciót (szenzor-függő)

## Telepítési lépések

### 1. Szükséges szoftverek telepítése

#### Windows/Mac/Linux:
- **Node.js 18+**: https://nodejs.org
- **Android Studio**: https://developer.android.com/studio
- **Java JDK 17**: Az Android Studio telepíti

#### Android Studio telepítés után:
- Nyisd meg az Android Studio-t
- Menj a **SDK Manager**-be
- Telepítsd az **Android SDK Platform 34** (Android 14)
- Telepítsd a **Android SDK Build-Tools 34.0.0**
- Telepítsd az **NDK (Side by side)** ha majd C/C++ kellene

### 2. Projekt előkészítése

```bash
# 1. Klónozd/másold az AstroSnap PWA projektet
cp -r /home/z/my-project ~/astrosnap-native

# 2. Menj a mappába
cd ~/astrosnap-native

# 3. Telepítsd a függőségeket (a Capacitorral együtt)
npm install
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/filesystem
```

### 3. Capacitor inicializálása

```bash
# Capacitor config inicializálása
npx cap init AstroSnap hu.astrosnap.app --web-dir=out

# Android platform hozzáadása
npx cap add android
```

Ez létrehoz egy `android/` mappát, ami a natív Android projektet tartalmazza.

### 4. Camera2 Plugin hozzáadása

Másold a plugin Java fájljait az Android projektbe:

```bash
# A plugin Java fájljainak másolása
mkdir -p android/app/src/main/java/hu/astrosnap/camera2
cp android-app/java/hu/astrosnap/camera2/Camera2Plugin.java \
   android/app/src/main/java/hu/astrosnap/camera2/
cp android-app/java/hu/astrosnap/camera2/Camera2Manager.java \
   android/app/src/main/java/hu/astrosnap/camera2/
cp android-app/java/hu/astrosnap/camera2/CameraSettings.java \
   android/app/src/main/java/hu/astrosnap/camera2/
```

### 5. MainActivity módosítása

Nyisd meg az `android/app/src/main/java/hu/astrosnap/app/MainActivity.java` fájlt és módosítsd:

```java
package hu.astrosnap.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import hu.astrosnap.camera2.Camera2Plugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin regisztrálása a bridge előtt!
        registerPlugin(Camera2Plugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

### 6. AndroidManifest.xml jogosultságok

Nyisd meg az `android/app/src/main/AndroidManifest.xml` fájlt és add hozzá:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Kamera jogosultság -->
    <uses-permission android:name="android.permission.CAMERA" />
    
    <!-- Tárhely jogosultságok (képek mentéséhez) -->
    <uses-permission 
        android:name="android.permission.WRITE_EXTERNAL_STORAGE" 
        android:maxSdkVersion="29" />
    <uses-permission 
        android:name="android.permission.READ_EXTERNAL_STORAGE" 
        android:maxSdkVersion="32" />
    
    <!-- Kamera hardver követelmény -->
    <uses-feature 
        android:name="android.hardware.camera2" 
        android:required="true" />
    <uses-feature 
        android:name="android.hardware.camera.autofocus" 
        android:required="false" />

    <application ...>
        ...
    </application>
</manifest>
```

### 7. build.gradle beállítások

Az `android/app/build.gradle` fájlban állítsd be:

```gradle
android {
    compileSdkVersion 34

    defaultConfig {
        minSdkVersion 24  // Android 7.0 - Camera2 API teljes támogatás
        targetSdkVersion 34
    }
}

dependencies {
    implementation 'androidx.core:core:1.12.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
}
```

### 8. Web build és sync

```bash
# Next.js statikus export (a webDir=out miatt)
npm run build

# Sync a Capacitorral
npx cap sync android
```

### 9. Android Studio megnyitása és build

```bash
# Android Studio megnyitása
npx cap open android
```

Az Android Studióban:
1. Várd meg, amíg a Gradle szinkronizál
2. Csatlakoztasd a telefonod USB-n (developer mode + USB debugging)
3. Nyomd meg a **Run** (zöld háromszög) gombot
4. Válaszd ki a telefonodat
5. Várd meg, amíg az app települ és elindul

### 10. APK generálása (telepíthető fájl)

Ha nem USB-vel akarod telepíteni, hanem APK-t generálni:

```bash
# Debug APK
cd android
./gradlew assembleDebug

# Az APK itt lesz:
# android/app/build/outputs/apk/debug/app-debug.apk
```

Ezt az APK-t átmásolhatod a telefonodra és telepítheted.

## Plugin használata a frontend-en

A meglévő AstroSnap PWA kódja automatikusan érzékeli, ha natív környezetben fut (Capacitor), és használja a Camera2Plugin-t. Ha böngészőben fut, akkor a webes fallback-et használja.

### Példa hosszú expozíció használatára:

```typescript
import { getCamera2Plugin } from '@/android-app/typescript/Camera2Plugin';

async function captureLongExposure() {
  const plugin = await getCamera2Plugin();
  
  if (plugin) {
    // Natív Camera2 API - valódi hosszú expozíció!
    const result = await plugin.captureLongExposure({
      exposureSeconds: 17.7,
      iso: 3200,
      whiteBalanceK: 4000,
      focusMode: 'infinity',
      zoom: 1.0,
      rawFormat: true,  // DNG mentés
      outputDir: 'AstroSnap/light'
    });
    
    console.log('Kép elmentve:', result.path);
  } else {
    // Böngésző fallback - frame átlagolás
    console.log('Camera2 plugin nem elérhető, webes módot használunk');
  }
}
```

## Tesztelés és debug

### Capacitor plugin ellenőrzése:

```typescript
import { isCamera2PluginAvailable } from '@/android-app/typescript/Camera2Plugin';

if (isCamera2PluginAvailable()) {
  console.log('✓ Natív Camera2 plugin aktív');
} else {
  console.log('✗ Böngésző módban vagyunk');
}
```

### Képességek lekérdezése:

```typescript
const plugin = await getCamera2Plugin();
if (plugin) {
  const { capabilities } = await plugin.getCapabilities();
  console.log('Max expozíció:', capabilities.effectiveMaxExposureSeconds, 's');
  console.log('Max ISO:', capabilities.maxIso);
  console.log('RAW támogatott:', capabilities.rawFormatSupported);
  console.log('Szenzor:', capabilities.megapixels, 'MP');
}
```

## Hibaelhárítás

### "Camera permission denied"
- Ellenőrizd, hogy az AndroidManifest.xml tartalmazza a CAMERA permission-t
- Az app indításakor a rendszer kérni fogja a jogosultságot - engedélyezd

### "Kamera már használatban van"
- Zárd be a többi kamera appot
- Indítsd újra az appot

### "Camera2 API nem támogatott"
- Régi Android (6.0 vagy korábbi)
- Néhány olcsó telefon nem támogatja a manual sensor-t

### "RAW formátum nem támogatott"
- A telefonod szenzora nem támogatja a DNG mentést
- Használd a `rawFormat: false` beállítást

### Build hibák
- Android Studio: File → Sync Project with Gradle Files
- Telepítsd a hiányzó SDK-kat az SDK Manager-ben
- Ellenőrizd a Java verziót (JDK 17 szükséges)

## Telefon kompatibilitás

| Telefon | Manual ISO | Hosszú expozíció | RAW (DNG) | Megjegyzés |
|---------|-----------|------------------|-----------|------------|
| Samsung Galaxy S21+ | ✅ | ✅ 30s | ✅ | Minden funkció |
| Google Pixel 6+ | ✅ | ✅ 30s | ✅ | Minden funkció |
| Xiaomi Mi 11+ | ✅ | ✅ 30s | ✅ | Minden funkció |
| Oneplus 8+ | ✅ | ✅ 30s | ✅ | Minden funkció |
| Huawei P40+ | ✅ | ✅ 30s | ✅ | Minden funkció (GMS nélkül) |
| Középkategóriás (200-500 EUR) | ⚠️ | ⚠️ | ⚠️ | Eszközfüggő |

## Licenc

MIT – szabadon használható, módosítható, terjeszthető.
