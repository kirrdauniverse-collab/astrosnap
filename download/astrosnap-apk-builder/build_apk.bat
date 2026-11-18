# AstroSnap APK építő - Windows

@echo off
chcp 65001 > nul
title AstroSnap APK építő

echo.
echo ============================================================
echo   AstroSnap APK építő (Windows)
echo ============================================================
echo.

REM Ellenőrizzük a Node.js-t
node --version > nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js nincs telepítve!
    echo.
    echo Telepítsd innen: https://nodejs.org
    echo Telepítés során hagyd bepipálva az "Add to PATH" opciót!
    echo.
    pause
    exit /b 1
)
echo ✓ Node.js: 
node --version

REM Git Bash vagy WSL ellenőrzése (a bash script futtatásához)
where bash > nul 2>&1
if errorlevel 1 (
    echo.
    echo ⚠ A bash script futtatásához Git Bash vagy WSL szükséges.
    echo.
    echo Opció 1: Telepítsd a Git for Windows-t: https://git-scm.com/download/win
    echo          Ez tartalmaz Git Bash-t, amivel futtathatod a build_apk.sh-t.
    echo.
    echo Opció 2: Használd a WSL-t (Windows Subsystem for Linux).
    echo.
    echo Opció 3: Kövesd a BUILD_INSTRUCTIONS.md fájlt manuálisan.
    echo.
    pause
    exit /b 1
)

echo ✓ Bash elérhető
echo.

REM Futtatjuk a bash scriptet
echo 📺 AstroSnap APK építő indítása...
echo.
bash "%~dp0build_apk.sh"

echo.
pause
