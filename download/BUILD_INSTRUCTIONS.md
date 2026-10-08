# AstroSnap - APK építési útmutató

## Áttekintés

Ez a mappa tartalmazza az AstroSnap PWA → Android APK építéséhez szükséges összes fájlt. Az APK a natív Camera2 API-t használja, ami lehetővé teszi:

- ✅ **Valódi hosszú expozíció** (1-30 másodperc, a szenzor tényleges expozíciója!)
- ✅ **RAW (DNG) formátum** mentés
- ✅ **Manual ISO** (50-6400)
- ✅ **Manual fókusz** (végtelenre állítható csillagokhoz)
- ✅ **Manual fehérmérleg** Kelvin-ben

## Fájlok listája

| Fájl | Leírás |
|------|--------|
| `build_apk.sh` | APK építő script (Mac/Linux/Git Bash) |
| `build_apk.bat` | APK építő indító (Windows) |
| `convert_raw.py` | RAW → JPEG/DNG konvertáló (Python) |
| `convert_raw.bat` | RAW konvertáló indító (Windows) |
| `BUILD_INSTRUCTIONS.md` | Ez a fájl - részletes útmutató |

## Előfeltételek

### 1. Node.js 18+
- Letöltés: https://nodejs.org
- Telepítés során hagyd bepipálva az "Add to PATH" opciót

### 2. Android Studio
- Letöltés: https://developer.android.com/studio
- Telepítés során hagyd az alapértelmezett beállításokat
- Az Android Studio tartalmazza:
  - Android SDK
  - Java JDK 17
  - Gradle
  - Emulator

### 3. (Opcionális) Git for Windows
- Letöltés: https://git-scm.com/download/win
- Ez tartalmazza a Git Bash-t, amivel futtathatod a `build_apk.sh` scriptet
- Ha nincs Git Bash, kövesd a manuális lépéseket lentebb

### 4. (Opcionális) Python 3.8+
- A RAW konvertálóhoz kell
- Letöltés: https://www.python.org/downloads/
- Telepítés során hagyd bepipálva az "Add Python to PATH" opciót

## Opció 1: Automatikus építés (ajánlott)

### Windows:
1. Töltsd le ezt a mappát
2. Kattints duplán a `build_apk.bat` fájlon
3. Várd meg, amíg lefut a script

### Mac/Linux/Git Bash:
1. Nyiss egy terminált ebben a mappában
2. Futtasd: `chmod +x build_apk.sh && ./build_apk.sh`

A script automatikusan:
- Lemásolja az AstroSnap projektet
- Telepíti a függőségeket
- Hozzáadja a Capacitor-t
- Hozzáadja az Android platformot
- Hozzáadja a Camera2 plugin-t
- Buildeli a webes részt
- Szinkronizálja az egészet

## Opció 2: Manuális építés

Ha az automatikus script nem működik, kövesd ezeket a lépéseket:

### 1. Projekt előkészítése

```bash
# Másold az AstroSnap projektet egy új mappába
mkdir astrosnap-build
cd astrosnap-build

# Másold a fontos fájlokat
cp -r /path/to/astrosnap/src .
cp -r /path/to/astrosnap/public .
cp /path/to/astrosnap/package.json .
cp /path/to/astrosnap/tsconfig.json .
cp /path/to/astrosnap/next.config.ts .
cp /path/to/astrosnap/tailwind.config.ts .
cp /path/to/astrosnap/postcss.config.mjs .
cp /path/to/astrosnap/components.json .
```

### 2. Függőségek telepítése

```bash
npm install
npm install @capacitor/core @capacitor/cli @capacitor/android
```

### 3. Next.js konfigurálása statikus exporthoz

Hozd létre a `next.config.ts` fájlt a következő tartalommal:

```typescript
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
};

export default nextConfig;
```

### 4. Webes build

```bash
npm run build
```

### 5. Capacitor inicializálása

```bash
npx cap init AstroSnap hu.astrosnap.app --web-dir=out
```

### 6. Android platform hozzáadása

```bash
npx cap add android
```

### 7. Camera2 plugin hozzáadása

Hozd létre a következő mappát és fájlokat:

```
android/app/src/main/java/hu/astrosnap/camera2/
├── Camera2Plugin.java
├── Camera2Manager.java
└── CameraSettings.java
```

Ezek a fájlok megtalálhatók a `build_apk.sh` scriptben (a `cat >` parancsoknál). Másold őket külön fájlba.

### 8. MainActivity frissítése

Cseréld le az `android/app/src/main/java/hu/astrosnap/app/MainActivity.java` fájlt:

```java
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
```

### 9. AndroidManifest.xml frissítése

Add hozzá ezeket a jogosultságokat az `android/app/src/main/AndroidManifest.xml` fájlhoz (a `<application>` tag elé):

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-feature android:name="android.hardware.camera2" android:required="true" />
```

### 10. Sync és build

```bash
npx cap sync android
```

### 11. Android Studio megnyitása

```bash
npx cap open android
```

### 12. APK build

Az Android Studióban:
1. Várd meg a Gradle szinkronizációt (1-2 perc)
2. **Build → Build Bundle(s)/APK(s) → Build APK(s)**
3. Várd meg a build-et (1-3 perc)
4. Az APK itt lesz: `android/app/build/outputs/apk/debug/app-debug.apk`

## APK telepítése a telefonra

### USB-n keresztül:
1. Engedélyezd a **Developer Mode**-ot a telefonon:
   - Beállítások → A telefonról → kattints 7-szer a "Build number"-re
2. Engedélyezd a **USB Debugging**-et:
   - Beállítások → Fejlesztői beállítások → USB hibakeresés
3. Csatlakoztasd a telefont USB-n
4. Az Android Studióban kattints a **▶ Run** gombra

### APK másolással:
1. Másold az APK fájlt a telefonodra (pl. Gmail, Google Drive, USB)
2. Engedélyezd az **"Ismeretlen források"** opciót (Beállítások → Biztonság)
3. Nyisd meg az APK fájlt a telefonon
4. Telepítsd az appot

## RAW fájl konvertáló használata

Ha a kamerád CR2/NEF/ARW formátumban ment, és DNG-vé akarod konvertálni (hogy az app fel tudja dolgozni):

### Windows:
1. Telepítsd a Pythont: https://www.python.org/downloads/
2. Kattints duplán a `convert_raw.bat` fájlon
3. Kövesd az utasításokat

### Mac/Linux:
```bash
pip install rawpy imageio pillow
python convert_raw.py /path/to/raw_files /path/to/output --format jpeg
```

A konvertáló támogatja a következő RAW formátumokat:
- Canon: CR2, CR3
- Nikon: NEF
- Sony: ARW
- Fujifilm: RAF
- Olympus: ORF
- Panasonic: RW2
- Pentax: PEF
- Samsung: SRW
- és még sok más

## Hibaelhárítás

### "Node.js nincs telepítve"
- Telepítsd a Node.js-t: https://nodejs.org

### "Android SDK not found"
- Telepítsd az Android Studio-t
- Android Studióban: File → Project Structure → SDK Location

### "Gradle build failed"
- Ellenőrizd az internet kapcsolatot (Gradle letölti a függőségeket)
- Android Studio: File → Sync Project with Gradle Files

### "Camera permission denied"
- A telefonon: Beállítások → Appok → AstroSnap → Engedélyek → Kamera → Engedélyez

### "A kamera nem elérhető"
- Zárd be a többi kamera appot
- Indítsd újra a telefont

### "Bash script nem fut"
- Windows: telepítsd a Git for Windows-t (https://git-scm.com/download/win)
- Vagy kövesd a manuális lépéseket fentebb

## Tesztelés

Az app telepítése után:

1. **Kamera képességek ellenőrzése**:
   - Felvétel tab → Kamera indítása
   - A toast üzenet mutatja a támogatott funkciókat

2. **Hosszú expozíció tesztelése**:
   - Beállítás tab → Tejút → 17.7s záridő
   - Felvétel tab → Fotózz a számítógép asztalára
   - A képnek **fehérnek kell lennie** (túlexponálva)

3. **RAW mentés tesztelése**:
   - Beállítás tab → Kapcsold be a RAW formátumot
   - Készíts egy képet
   - A kép metadata-ban "DNG (RAW)" felirat kell legyen

## Támogatás

Ha problémád van:
1. Ellenőrizd a konzolt (Chrome devtools)
2. Nézd meg az Android Studio logcat kimenetét
3. Küldd el a hibaüzenetet

Sok sikert a fotózáshoz! 🌌📷
