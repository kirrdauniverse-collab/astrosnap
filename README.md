# 🌌 AstroSnap

**Asztrofotó alkalmazás telefonra - Camera2 API-val, stackinggel és színkorrekcióval**

![AstroSnap](https://img.shields.io/badge/AstroSnap-v1.0-emerald)
![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20Web-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## 📖 Tartalomjegyzék

- [Áttekintés](#áttekintés)
- [Főbb funkciók](#főbb-funkciók)
- [Telepítés](#telepítés)
- [Használat](#használat)
- [Natív APK építés](#natív-apk-építés)
- [RAW fájl konvertáló](#raw-fájl-konvertáló)
- [Technológiák](#technológiák)
- [Licenc](#licenc)

## 🎯 Áttekintés

Az AstroSnap egy PWA (Progressive Web App) asztrofotózáshoz, amely:
- **Webes környezetben** fut (böngészőben, telepíthető PWA-ként)
- **Natív Android APK**-ként is buildelhető (Capacitor + Camera2 API)
- **Teljes asztrofotó munkafolyamatot** kínál: beállítások → felvétel → kalibráció → feldolgozás

## ✨ Főbb funkciók

### 1. ⚙️ Beállítás tab - Automatikus beállítások
- **9 célpont**: Tejút, Hold, Bolygók, Köd, Galaxis, Csillaghalmaz, Csillagcsíkok, Sarki fény, Csillagkép
- **6 eszköz**: Telefon kézből/állványon, Távcső afokál/primer, DSLR
- **Égbolt körülmények**: Bortle skála, holdfázis, felhőzettség, seeing
- **500-szabály**: Automatikus max expozíció számítás csillagmozgás nélkül
- **Zoom és tracking** támogatás
- **Előzár-idő** (önkioldó) beállítása

### 2. 📷 Felvétel tab - Kamera
- **Élő kamera viewfinder** (nagy felbontás)
- **Pro funkciók**: rács (rule of thirds), hisztogram, zebra (túlexpozíció)
- **Manual vezérlők**: zoom, fókusz, expozíció kompenzáció, fehérmérleg
- **Hosszú expozíció**: 
  - Webes: frame átlagolás (fallback)
  - Natív APK: **valódi 1-30 másodperces záridő!**
- **Burst sorozat**: akár 100+ kép
- **RAW (DNG) mentés** (natív APK)

### 3. 🎚️ Kalibráció tab
- **Dark frame** rögzítés (sötét expozíció, zaj méréséhez)
- **Flat frame** rögzítés (vignettálás korrigálásához)
- **Bias frame** rögzítés (offset méréséhez)
- Mindegyik külön tab-on, sorozattal és előzmény listával

### 4. 🖼️ Könyvtár tab
- Összes kép böngészése típus szerinti szűréssel
- **Képnéző modal**: teljes képernyős megtekintés metaadatokkal
- Letöltés (PNG/JPEG), törlés egyenként vagy mindet
- Statisztikák képenként

### 5. ✨ Feldolgozás tab
- **Kép kiválasztás** grid nézetben
- **Stacking** (képek egybeillesztése):
  - **Auto alignment** (Normalizált Kereszt-Korreláció)
  - **Kombinálási módszerek**: átlag, medián, sigma-clip
  - **Manuális forgatás/eltolás**
- **Kalibrációs frame-ek** használata (dark, flat, bias)
- **Színkorrekció**:
  - Auto levels (hisztogram alapú)
  - Hőmérséklet, tint, expozíció EV
  - Kontraszt, highlights, shadows
  - Saturation, vibrance, gamma
  - Black/white point

## 🚀 Telepítés

### Webes PWA (böngésző)

1. Nyisd meg a preview linket Chrome/Edge böngészővel
2. Telefonon: böngésző menü → "Telepítés alkalmazásként"
3. Az app ikon megjelenik a kezdőképernyőn

### Fejlesztői telepítés

```bash
# Klónozd a repot
git clone https://github.com/kirrdauniverse-collab/astrosnap.git
cd astrosnap

# Függőségek telepítése
npm install

# Fejlesztői szerver indítása
npm run dev

# Build
npm run build
```

## 📱 Natív APK építés

Az APK a **valódi Camera2 API**-t használja, ami lehetővé teszi:
- ✅ **Valódi hosszú expozíció** (1-30 másodperc, a szenzor tényleges expozíciója)
- ✅ **RAW (DNG) formátum** mentés
- ✅ **Manual ISO** (50-6400)
- ✅ **Manual fókusz** (végtelenre állítható csillagokhoz)
- ✅ **Manual fehérmérleg** Kelvin-ben

### Előfeltételek

- **Node.js 18+**: https://nodejs.org
- **Android Studio**: https://developer.android.com/studio
- **Java JDK 17** (az Android Studio telepíti)
- **Git for Windows** (Windows-on): https://git-scm.com/download/win

### Építés

1. Töltsd le a `download/astrosnap-apk-builder.zip` fájlt
2. Csomagold ki
3. Futtasd a `build_apk.sh` (Mac/Linux/Git Bash) vagy `build_apk.bat` (Windows) fájlt
4. A script automatikusan:
   - Lemásolja az AstroSnap projektet
   - Telepíti a Capacitor-t
   - Hozzáadja az Android platformot
   - Generálja a Camera2 plugin Java fájljait
   - Buildeli a webes részt
5. Nyisd meg Android Studióban: `npx cap open android`
6. Build → Build APK(s)
7. Az APK: `android/app/build/outputs/apk/debug/app-debug.apk`

Részletes útmutató: `download/BUILD_INSTRUCTIONS.md`

## 🔄 RAW fájl konvertáló

Ha a kamerád CR2/NEF/ARW formátumban ment, a `convert_raw.py` script segítségével JPEG/DNG/PNG formátumra konvertálhatod:

```bash
# Telepítés
pip install rawpy imageio pillow

# Használat
python convert_raw.py /path/to/raw_files /path/to/output --format jpeg
```

**Támogatott RAW formátumok**:
- Canon: CR2, CR3
- Nikon: NEF
- Sony: ARW
- Fujifilm: RAF
- Olympus: ORF
- Panasonic: RW2
- Pentax: PEF
- Samsung: SRW
- és még sok más

## 🛠️ Technológiák

### Frontend
- **Next.js 16** (App Router, Turbopack)
- **TypeScript 5**
- **Tailwind CSS 4**
- **shadcn/ui** komponens könyvtár
- **Lucide icons**

### Kamera és képfeldolgozás
- **MediaDevices API** (webes kamera)
- **ImageCapture API** (PhotoSettings, grabFrame)
- **Camera2 API** (natív Android, Java plugin)
- **Capacitor** (PWA → APK wrapper)
- **UTIF.js** (DNG/TIFF dekódolás)
- **Canvas API** (képfeldolgozás)

### Adattárolás
- **IndexedDB** (kliens oldali képtárolás)
- **File System API** (natív APK fájl mentés)

### Build
- **Turbopack** (web)
- **Gradle** (Android)
- **Capacitor CLI** (PWA → APK)

## 📁 Projekt struktúra

```
astrosnap/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── AstroApp.tsx          # Fő alkalmazás
│   │   ├── astro/
│   │   │   ├── SetupTab.tsx       # Beállítások
│   │   │   ├── CaptureTab.tsx     # Kamera/felvétel
│   │   │   ├── CalibrationTab.tsx # Kalibrációs frame-ek
│   │   │   ├── LibraryTab.tsx     # Képkönyvtár
│   │   │   └── ProcessTab.tsx     # Feldolgozás
│   │   └── ui/                    # shadcn/ui komponensek
│   └── lib/
│       ├── astro/
│       │   ├── types.ts           # TypeScript típusok
│       │   └── calculator.ts      # Beállítás számító motor
│       ├── storage/
│       │   └── db.ts              # IndexedDB tároló
│       └── processing/
│           ├── stacking.ts        # Kép egybeillesztés
│           ├── colorCorrection.ts # Színkorrekció
│           ├── rawDecoder.ts      # DNG/TIFF dekódoló
│           ├── proCamera.ts       # Pro Camera API
│           └── nativeCameraBridge.ts # Natív Camera2 híd
├── public/
│   ├── manifest.webmanifest       # PWA manifest
│   └── logo.svg
├── download/                      # Letölthető fájlok
│   ├── astrosnap-apk-builder.zip  # APK builder csomag
│   ├── convert_raw.py            # RAW konvertáló
│   ├── build_apk.sh              # APK build script
│   └── BUILD_INSTRUCTIONS.md     # Részletes útmutató
├── package.json
├── tsconfig.json
├── next.config.ts
└── README.md
```

## 📋 Kompatibilitás

### Webes PWA
- **Chrome 75+** (Android, Desktop)
- **Edge 75+** (Android, Desktop)
- **Safari 15+** (iOS, macOS) - korlátozott

### Natív APK
- **Android 7.0+** (API 24+) - Camera2 API teljes támogatás
- **Android 10+** (API 29+) - RAW DNG formátum

### Tesztelt telefonok
- Xiaomi 17T (30s záridő támogatás)
- Samsung Galaxy S20+
- Google Pixel 5+

## 🎓 Használati útmutató

### Gyors kezdés

1. **Beállítás tab**: Válaszd ki a célpontot (pl. Tejút), az eszközt (Telefon állványon), és az égbolt körülményeket
2. **Felvétel tab**: Indítsd el a kamerát, állítsd be a fókuszt (végtelenre csillagokhoz), készíts egy képet
3. **Kalibráció tab**: Készíts dark/flat/bias frame-eket a zaj csökkentéséhez
4. **Feldolgozás tab**: Válaszd ki a light frame-eket, add hozzá a kalibrációs frame-eket, és stackeld
5. **Színkorrekció**: Auto levels, hőmérséklet, kontraszt beállítása

### Tippek

- **500-szabály**: 24mm fókusznál max 17.7s záridő (csillagmozgás nélkül)
- **Tracking**: Ha van motoros követésed, kapcsold be a tracking opciót
- **Előzár-idő**: 2-5 másodperc ajánlott fix állványon (rezgés csökkentése)
- **RAW**: Ha a telefonod támogatja, mindig használj DNG formátumot
- **Stacking**: 20-30 kép ajánlott a jó zajcsökkentéshez

## 📝 Licenc

MIT License - szabadon használható, módosítható, terjeszthető.

## 🤝 Hozzájárulás

1. Fork-old a repot
2. Csinálj egy branch-et (`git checkout -b feature/uj-funkcio`)
3. Commitolj (`git commit -m 'Új funkció hozzáadva'`)
4. Pusholj (`git push origin feature/uj-funkcio`)
5. Nyiss egy Pull Request-et

## 📞 Támogatás

Ha problémád van:
1. Ellenőrizd a konzolt (Chrome devtools)
2. Nézd meg az Android Studio logcat kimenetét
3. Nyiss egy Issue-t a GitHub-on

---

⭐ Ha tetszik az app, adj egy csillagot a repónak!

🌌 **Clear skies!**
