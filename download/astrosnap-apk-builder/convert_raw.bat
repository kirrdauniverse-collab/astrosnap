@echo off
chcp 65001 > nul
title AstroSnap RAW konvertáló

echo.
echo ============================================================
echo   AstroSnap RAW → JPEG/DNG konvertáló
echo ============================================================
echo.

REM Python telepítve van-e?
python --version > nul 2>&1
if errorlevel 1 (
    echo ❌ Python nincs telepítve!
    echo.
    echo Telepítsd a Pythont innen: https://www.python.org/downloads/
    echo Telepítés során pipeljd be az "Add Python to PATH" opciót!
    echo.
    pause
    exit /b 1
)

echo ✓ Python telepítve: 
python --version

REM Függőségek telepítése
echo.
echo 📦 Szükséges könyvtárak ellenőrzése...
python -c "import rawpy" 2>nul
if errorlevel 1 (
    echo ❌ rawpy nem található, telepítés...
    pip install rawpy imageio pillow
    if errorlevel 1 (
        echo ❌ Telepítés sikertelen! Próbáld manuálisan:
        echo    pip install rawpy imageio pillow
        pause
        exit /b 1
    )
) else (
    echo ✓ Függőségek telepítve
)

echo.
echo ============================================================
echo   Használat:
echo   1. Húzd ide a RAW fájlokat tartalmazó mappát
echo   2. Vagy írd be a mappa útját
echo ============================================================
echo.

set /p "input=📁 RAW fájlok mappája (vagy húzd ide): "
set /p "output=📂 Kimeneti mappa (Enter = 'output'): "
if "%output%"=="" set "output=output"
set /p "format=🎨 Formátum (1=JPEG/2=DNG/3=PNG) [1]: "
if "%format%"=="" set "format=1"

if "%format%"=="1" (
    set "fmt=jpeg"
) else if "%format%"=="2" (
    set "fmt=dng"
) else if "%format%"=="3" (
    set "fmt=png"
) else (
    set "fmt=jpeg"
)

echo.
echo 🔄 Konvertálás indul...
echo.

python "%~dp0convert_raw.py" --format %fmt% "%input%" "%output%"

echo.
echo ============================================================
echo   Kész! A konvertált fájlok itt: %output%
echo ============================================================
echo.
echo Következő lépések:
echo   1. Nyisd meg az AstroSnap app-ot telefonon
echo   2. Felvétel tab → Feltöltés gomb
echo   3. Töltsd fel a konvertált fájlokat
echo   4. Feldolgozás tab → Stackelés!
echo.
pause
