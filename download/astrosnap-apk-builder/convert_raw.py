#!/usr/bin/env python3
"""
AstroSnap RAW → DNG/JPEG konvertáló
====================================

Ez a program a számítógépeden futtatható, és a kamerád által készített
RAW fájlokat (CR2, NEF, ARW, RAF, ORF, RW2, PEF, SRW) konvertálja
DNG vagy JPEG formátumra, amit az AstroSnap app fel tud dolgozni.

TELEPÍTÉS:
----------
1. Telepítsd a Pythont 3.8+: https://www.python.org/downloads/
2. Futtasd a parancssorban:
   pip install rawpy imageio pillow

HASZNÁLAT:
---------
Alapvető használat:
    python convert_raw.py

Egy mappa összes RAW fájljának konvertálása:
    python convert_raw.py /path/to/raw_files /path/to/output

Csak JPEG kimenet (gyorsabb, kompatibilis):
    python convert_raw.py --format jpeg input output

DNG kimenet (RAW minőség, az app ezt tudja feldolgozni):
    python convert_raw.py --format dng input output

Specifikus fájlok konvertálása:
    python convert_raw.py --files img1.CR2 img2.CR2

Kimeneti minőség beállítása (JPEG):
    python convert_raw.py --quality 95 input output

Tömeges konvertálás több mappából:
    python convert_raw.py --recursive /path/to/photos /path/to/output
"""

import argparse
import os
import sys
from pathlib import Path
from typing import List, Optional

# RAW fájlkiterjesztések, amiket a rawpy tud olvasni
RAW_EXTENSIONS = {
    ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2",
    ".pef", ".srw", ".raw", ".dng", ".tiff", ".tif",
    ".3fr", ".iiq", ".kdc", ".mef", ".mos", ".mrw", ".nrw",
    ".ptx", ".pxn", ".r3d", ".raw", ".rwl", ".srf", ".sr2",
    ".x3f",
}


def check_dependencies():
    """Ellenőrzi, hogy a szükséges könyvtárak telepítve vannak-e."""
    missing = []
    try:
        import rawpy
    except ImportError:
        missing.append("rawpy")
    try:
        import imageio
    except ImportError:
        missing.append("imageio")
    try:
        from PIL import Image
    except ImportError:
        missing.append("pillow")

    if missing:
        print("❌ Hiányzó könyvtárak:", ", ".join(missing))
        print("\nTelepítsd őket a következő paranccsal:")
        print("    pip install " + " ".join(missing))
        print("\nHa a pip nem található, használd:")
        print("    python -m pip install " + " ".join(missing))
        sys.exit(1)


def convert_raw_to_jpeg(
    input_path: str,
    output_path: str,
    quality: int = 95,
    auto_wb: bool = True,
    camera_wb: bool = False,
    half_size: bool = False,
) -> bool:
    """
    Egy RAW fájlt JPEG-re konvertál.

    Paraméterek:
        input_path: A bemeneti RAW fájl útja
        output_path: A kimeneti JPEG fájl útja
        quality: JPEG minőség (1-100, alapértelmezett 95)
        auto_wb: Automatikus fehérmérleg (True/False)
        camera_wb: Kamera által beállított fehérmérleg használata
        half_size: Fél méret (gyorsabb, de kisebb felbontás)

    Visszatér:
        True ha sikeres, False ha nem
    """
    try:
        import rawpy
        from PIL import Image
        import io

        # RAW fájl megnyitása
        with rawpy.imread(input_path) as raw:
            # Kép dekódolása
            params = rawpy.Params()
            params.use_auto_wb = auto_wb
            params.use_camera_wb = camera_wb
            params.half_size = half_size
            params.output_bps = 8  # 8-bit kimenet JPEG-hez
            params.user_qual = 3   # AHD interpolation (legjobb minőség)

            rgb = raw.postprocess(params)

            # PIL Image-et csinálunk belőle
            img = Image.fromarray(rgb)

            # EXIF orientáció alkalmazása (ha van)
            try:
                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            # Mentés JPEG-ként
            output_dir = os.path.dirname(output_path)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)

            img.save(output_path, "JPEG", quality=quality, optimize=True)
            return True

    except Exception as e:
        print(f"  ❌ Hiba: {e}")
        return False


def convert_raw_to_dng(
    input_path: str,
    output_path: str,
    use_camera_wb: bool = True,
) -> bool:
    """
    Egy RAW fájlt DNG formátumra konvertál.

    Megjegyzés: A DNG konvertáláshoz az Adobe DNG Converter szükséges,
    mert a rawpy nem tud DNG-t írni. Ez a függvény JPEG-et készít,
    és figyelmezteti a felhasználót, hogy telepítse az Adobe DNG Converter-t.

    Paraméterek:
        input_path: A bemeneti RAW fájl útja
        output_path: A kimeneti DNG fájl útja
        use_camera_wb: Kamera fehérmérleg használata
    """
    print("  ⚠ Megjegyzés: A DNG íráshoz Adobe DNG Converter szükséges.")
    print("    Letöltés: https://helpx.adobe.com/camera-raw/digital-negative.html")
    print("    Ha nincs telepítve, JPEG-et készítünk helyette.")
    print()

    # Próbáljuk meg Adobe DNG Converter-rel
    dng_converter_paths = [
        "/Applications/Adobe DNG Converter.app/Contents/MacOS/Adobe DNG Converter",
        "C:\\Program Files\\Adobe\\Adobe DNG Converter.exe",
        "/usr/bin/dngconverter",
        "dngconverter",
    ]

    for dng_path in dng_converter_paths:
        if os.path.exists(dng_path) or os.system(f"which {dng_path} > /dev/null 2>&1") == 0:
            # Adobe DNG Converter elérhető
            cmd = f'"{dng_path}" -c -d "{os.path.dirname(output_path)}" "{input_path}"'
            print(f"  Futtatás: {cmd}")
            result = os.system(cmd)
            if result == 0:
                return True

    # Ha nincs DNG Converter, JPEG-et készítünk
    print("  → Adobe DNG Converter nem található, JPEG konvertálás...")
    jpeg_output = output_path.rsplit(".", 1)[0] + ".jpg"
    return convert_raw_to_jpeg(input_path, jpeg_output, quality=95)


def convert_raw_to_png(
    input_path: str,
    output_path: str,
    auto_wb: bool = True,
    camera_wb: bool = False,
) -> bool:
    """
    Egy RAW fájlt PNG-re konvertál (veszteségmentes formátum).
    """
    try:
        import rawpy
        from PIL import Image

        with rawpy.imread(input_path) as raw:
            params = rawpy.Params()
            params.use_auto_wb = auto_wb
            params.use_camera_wb = camera_wb
            params.output_bps = 16  # 16-bit PNG (jobb minőség)
            params.user_qual = 3

            rgb = raw.postprocess(params)
            img = Image.fromarray(rgb)

            try:
                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            output_dir = os.path.dirname(output_path)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)

            img.save(output_path, "PNG")
            return True
    except Exception as e:
        print(f"  ❌ Hiba: {e}")
        return False


def find_raw_files(input_path: str, recursive: bool = False) -> List[str]:
    """
    Megkeresi az összes RAW fájlt egy mappában (vagy egy fájlt).
    """
    if os.path.isfile(input_path):
        return [input_path]

    if not os.path.isdir(input_path):
        print(f"❌ A bemeneti út nem létezik: {input_path}")
        return []

    files = []
    if recursive:
        for root, _, filenames in os.walk(input_path):
            for filename in filenames:
                ext = os.path.splitext(filename)[1].lower()
                if ext in RAW_EXTENSIONS:
                    files.append(os.path.join(root, filename))
    else:
        for filename in os.listdir(input_path):
            ext = os.path.splitext(filename)[1].lower()
            if ext in RAW_EXTENSIONS:
                files.append(os.path.join(input_path, filename))

    return sorted(files)


def get_output_path(
    input_file: str,
    output_dir: str,
    new_extension: str,
    keep_structure: bool = False,
    base_dir: Optional[str] = None,
) -> str:
    """
    Meghatározza a kimeneti fájl útját.
    """
    filename = os.path.basename(input_file)
    name_without_ext = os.path.splitext(filename)[0]
    new_filename = name_without_ext + "." + new_extension

    if keep_structure and base_dir:
        rel_path = os.path.relpath(input_file, base_dir)
        rel_dir = os.path.dirname(rel_path)
        return os.path.join(output_dir, rel_dir, new_filename)

    return os.path.join(output_dir, new_filename)


def main():
    parser = argparse.ArgumentParser(
        description="AstroSnap RAW → DNG/JPEG konvertáló",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Példák:
  %(prog)s                                          # Interaktív mód
  %(prog)s input_dir output_dir                     # Mappa konvertálása
  %(prog)s --format jpeg input_dir output_dir       # JPEG kimenet
  %(prog)s --format dng input_dir output_dir        # DNG kimenet
  %(prog)s --files img1.CR2 img2.CR2               # Specifikus fájlok
  %(prog)s --recursive /photos /output              # Rekurzív
        """,
    )

    parser.add_argument("input", nargs="?", help="Bemeneti mappa vagy fájl")
    parser.add_argument("output", nargs="?", help="Kimeneti mappa")
    parser.add_argument(
        "--format",
        choices=["jpeg", "dng", "png"],
        default="jpeg",
        help="Kimeneti formátum (alapértelmezett: jpeg)",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=95,
        help="JPEG minőség 1-100 (alapértelmezett: 95)",
    )
    parser.add_argument(
        "--files",
        nargs="+",
        help="Specifikus fájlok konvertálása",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Rekurzív keresés almappákban",
    )
    parser.add_argument(
        "--half-size",
        action="store_true",
        help="Fél méret (gyorsabb, de kisebb felbontás)",
    )
    parser.add_argument(
        "--camera-wb",
        action="store_true",
        help="Kamera fehérmérleg használata (auto helyett)",
    )
    parser.add_argument(
        "--keep-structure",
        action="store_true",
        help="Bemeneti mappaszerkezet megtartása a kimenetben",
    )

    args = parser.parse_args()

    # Függőségek ellenőrzése
    check_dependencies()

    # Interaktív mód, ha nincsenek argumentumok
    if not args.input and not args.files:
        print("\n" + "=" * 60)
        print("  AstroSnap RAW → DNG/JPEG konvertáló")
        print("=" * 60)
        print()

        args.input = input("📁 Bemeneti mappa vagy fájl útja: ").strip().strip('"').strip("'")
        if not args.input:
            print("❌ Nincs bemenet megadva.")
            sys.exit(1)

        args.output = input("📂 Kimeneti mappa (Enter = 'output'): ").strip().strip('"').strip("'")
        if not args.output:
            args.output = "output"

        print("\nKimeneti formátum:")
        print("  1. JPEG (alapértelmezett, kompatibilis, ~1-5 MB/kép)")
        print("  2. DNG (RAW minőség, ~10-30 MB/kép, Adobe DNG Converter szükséges)")
        print("  3. PNG (veszteségmentes, ~10-20 MB/kép)")
        format_choice = input("Válassz (1/2/3) [1]: ").strip() or "1"
        args.format = {"1": "jpeg", "2": "dng", "3": "png"}.get(format_choice, "jpeg")

        if args.format == "jpeg":
            quality = input("JPEG minőség (1-100) [95]: ").strip()
            args.quality = int(quality) if quality else 95

        half = input("Fél méret? (gyorsabb, kisebb felbontás) (i/N): ").strip().lower()
        args.half_size = half == "i" or half == "igen"

        recursive = input("Rekurzív keresés almappákban? (i/N): ").strip().lower()
        args.recursive = recursive == "i" or recursive == "igen"

        print()

    # Fájlok listájának összeállítása
    if args.files:
        files_to_convert = []
        for f in args.files:
            if os.path.exists(f):
                files_to_convert.append(f)
            else:
                print(f"⚠ Fájl nem található: {f}")
    else:
        files_to_convert = find_raw_files(args.input, args.recursive)

    if not files_to_convert:
        print("❌ Nem található konvertálandó RAW fájl.")
        print(f"   Támogatott kiterjesztések: {', '.join(sorted(RAW_EXTENSIONS))}")
        sys.exit(1)

    # Kimeneti mappa
    output_dir = args.output if args.output else "output"
    os.makedirs(output_dir, exist_ok=True)

    # Konvertálás
    print(f"\n🔄 {len(files_to_convert)} fájl konvertálása...")
    print(f"   Formátum: {args.format.upper()}")
    if args.format == "jpeg":
        print(f"   Minőség: {args.quality}")
    print(f"   Kimeneti mappa: {output_dir}")
    print()

    success_count = 0
    failed_count = 0
    failed_files = []

    for i, input_file in enumerate(files_to_convert, 1):
        filename = os.path.basename(input_file)
        print(f"[{i}/{len(files_to_convert)}] {filename}")

        # Kimeneti út meghatározása
        output_file = get_output_path(
            input_file,
            output_dir,
            args.format,
            args.keep_structure,
            args.input if args.keep_structure else None,
        )

        # Konvertálás a formátumnak megfelelően
        success = False
        if args.format == "jpeg":
            success = convert_raw_to_jpeg(
                input_file,
                output_file,
                quality=args.quality,
                camera_wb=args.camera_wb,
                half_size=args.half_size,
            )
        elif args.format == "dng":
            success = convert_raw_to_dng(
                input_file,
                output_file,
                use_camera_wb=args.camera_wb,
            )
        elif args.format == "png":
            success = convert_raw_to_png(
                input_file,
                output_file,
                camera_wb=args.camera_wb,
            )

        if success:
            print(f"  ✓ Kész: {os.path.basename(output_file)}")
            success_count += 1
        else:
            failed_count += 1
            failed_files.append(input_file)

    # Összefoglaló
    print("\n" + "=" * 60)
    print(f"  Kész! {success_count}/{len(files_to_convert)} fájl konvertálva.")
    if failed_count > 0:
        print(f"  ❌ {failed_count} fájl sikertelen:")
        for f in failed_files:
            print(f"     - {os.path.basename(f)}")
    print(f"  📂 Kimeneti mappa: {os.path.abspath(output_dir)}")
    print("=" * 60)

    # Következő lépések
    print("\n📋 Következő lépések:")
    print(f"  1. Nyisd meg az AstroSnap app-ot a telefonodon")
    print(f"  2. Felvétel tab → Feltöltés gomb")
    print(f"  3. Válaszd ki a konvertált fájlokat a kimeneti mappából")
    print(f"  4. Feldolgozás tab → Stackelés!")
    print()


if __name__ == "__main__":
    main()
