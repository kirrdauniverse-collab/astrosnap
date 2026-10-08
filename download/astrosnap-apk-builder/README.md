# AstroSnap - Natív Android APK

## Gyors indulás

### Windows:
1. Telepítsd a Node.js-t: https://nodejs.org
2. Telepítsd az Android Studio-t: https://developer.android.com/studio
3. Telepítsd a Git for Windows-t: https://git-scm.com/download/win
4. Kattints duplán a `build_apk.bat` fájlon

### Mac/Linux:
1. Telepítsd a Node.js-t és az Android Studio-t
2. Terminálban: `chmod +x build_apk.sh && ./build_apk.sh`

A script automatikusan lefuttatja a teljes build folyamatot és előkészíti az Android projektet.

## Részletes útmutató

Olvasd el a `BUILD_INSTRUCTIONS.md` fájlt a részletes lépésekért.

## Mit kapunk?

Az APK a következőket fogja tudni:
- ✅ Valódi hosszú expozíció (1-30 másodperc) - a szenzor tényleges expozíciója!
- ✅ RAW (DNG) formátum mentés
- ✅ Manual ISO (50-6400)
- ✅ Manual fókusz (végtelenre állítható csillagokhoz)
- ✅ Manual fehérmérleg Kelvin-ben
- ✅ Az összes AstroSnap funkció (stacking, színkorrekció, stb.)

## RAW konvertáló

Ha a kamerád CR2/NEF/ARW formátumban ment, használd a `convert_raw.py` scriptet,
hogy DNG-vé vagy JPEG-gé konvertáld a képeket, mielőtt feltöltöd az appba.

## Támogatás

Ha problémád van, lásd a `BUILD_INSTRUCTIONS.md` "Hibaelhárítás" szekcióját.
