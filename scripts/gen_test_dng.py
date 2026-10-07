"""
Egyszerű DNG/TIFF fájl generálása a UTIF.js dekóder teszteléséhez.
Egy egyszerű 64x64 RGB képet mentünk TIFF formátumban.
A DNG formátum technikailag TIFF alapú, így ez a fájl is dekódolható lesz.
"""
import struct
import os

# 64x64 RGB kép létrehozása - egyszerű gradiens + csillagok
WIDTH = 64
HEIGHT = 64

# Egyszerű TIFF fájl írása
def write_tiff(filename, width, height, rgb_data):
    """
    Egyszerű TIFF fájl írása (little-endian, RGB, nem tömörített).
    A DNG is TIFF alapú, így ez a fájl is olvasható lesz az UTIF.js-szel.
    """
    # TIFF header
    byte_order = b'II'  # Little-endian
    magic = struct.pack('<H', 42)  # TIFF magic number
    ifd_offset = struct.pack('<I', 8)  # IFD a 8. bájtnál
    
    # IFD bejegyzések (13 db)
    num_entries = 13
    ifd_size = 2 + num_entries * 12 + 4  # count + entries + next IFD offset
    
    # Kép adat mérete
    image_data_size = width * height * 3  # RGB, 1 bájt/csatorna
    
    # IFD offset
    ifd_start = 8
    # Image data offset (IFD után)
    image_data_offset = ifd_start + ifd_size
    
    # IFD bejegyzések (tag, type, count, value/offset)
    # Type: 3 = SHORT (2 bájt), 4 = LONG (4 bájt)
    entries = []
    # ImageWidth
    entries.append(struct.pack('<HHII', 256, 3, 1, width))
    # ImageLength (height)
    entries.append(struct.pack('<HHII', 257, 3, 1, height))
    # BitsPerSample (8, 8, 8)
    entries.append(struct.pack('<HHII', 258, 3, 3, image_data_offset + image_data_size))  # offset a 3 short-hoz
    # Compression (1 = no compression)
    entries.append(struct.pack('<HHII', 259, 3, 1, 1))
    # PhotometricInterpretation (2 = RGB)
    entries.append(struct.pack('<HHII', 262, 3, 1, 2))
    # StripOffsets
    entries.append(struct.pack('<HHII', 273, 4, 1, image_data_offset))
    # SamplesPerPixel (3)
    entries.append(struct.pack('<HHII', 277, 3, 1, 3))
    # RowsPerStrip
    entries.append(struct.pack('<HHII', 278, 3, 1, height))
    # StripByteCounts
    entries.append(struct.pack('<HHII', 279, 4, 1, image_data_size))
    # XResolution (offset a rationalhoz)
    entries.append(struct.pack('<HHII', 282, 5, 1, image_data_offset + image_data_size + 6))
    # YResolution (offset a rationalhoz)
    entries.append(struct.pack('<HHII', 283, 5, 1, image_data_offset + image_data_size + 14))
    # ResolutionUnit (2 = inch)
    entries.append(struct.pack('<HHII', 296, 3, 1, 2))
    # PlanarConfiguration (1 = chunky)
    entries.append(struct.pack('<HHII', 284, 3, 1, 1))
    
    # Összerakjuk a fájlt
    with open(filename, 'wb') as f:
        # Header
        f.write(byte_order + magic + ifd_offset)
        # IFD
        f.write(struct.pack('<H', num_entries))
        for entry in entries:
            f.write(entry)
        # Next IFD offset (0 = nincs több IFD)
        f.write(struct.pack('<I', 0))
        # Image data
        f.write(rgb_data)
        # BitsPerSample (3 short: 8, 8, 8)
        f.write(struct.pack('<HHH', 8, 8, 8))
        # XResolution (rational: 72/1)
        f.write(struct.pack('<II', 72, 1))
        # YResolution (rational: 72/1)
        f.write(struct.pack('<II', 72, 1))

# Kép adat generálása - egyszerű égbolt + csillagok
def generate_test_image(width, height):
    """Egy egyszerű éjszakai égbolt képet generál RGB formátumban."""
    data = bytearray()
    for y in range(height):
        for x in range(width):
            # Háttér: sötétkék
            r = 5
            g = 8
            b = 15
            
            # Középen egy kis "Tejút" sáv
            center_y = height // 2
            dist = abs(y - center_y)
            if dist < 10:
                milkyway_strength = 1 - dist / 10
                r = int(r + 20 * milkyway_strength)
                g = int(g + 15 * milkyway_strength)
                b = int(b + 30 * milkyway_strength)
            
            # Néhány "csillag" - véletlenszerűen elhelyezve
            # Előre meghatározott pozíciók (reprodukálható teszt)
            stars = [
                (10, 10), (20, 15), (30, 8), (45, 12), (55, 5),
                (15, 25), (35, 30), (50, 25), (5, 40), (25, 45),
                (40, 50), (55, 45), (10, 55), (30, 60), (50, 55),
            ]
            for (sx, sy) in stars:
                if abs(x - sx) <= 1 and abs(y - sy) <= 1:
                    dist = ((x - sx)**2 + (y - sy)**2) ** 0.5
                    brightness = max(0, 255 - dist * 100)
                    r = int(max(r, brightness))
                    g = int(max(g, brightness))
                    b = int(max(b, brightness))
            
            data.append(min(255, max(0, r)))
            data.append(min(255, max(0, g)))
            data.append(min(255, max(0, b)))
    return bytes(data)

if __name__ == "__main__":
    out_dir = "/home/z/my-project/test-images"
    os.makedirs(out_dir, exist_ok=True)
    
    print("Teszt TIFF/DNG fájl generálása...")
    rgb_data = generate_test_image(WIDTH, HEIGHT)
    out_file = os.path.join(out_dir, "test_dng.dng")
    write_tiff(out_file, WIDTH, HEIGHT, rgb_data)
    print(f"Teszt fájl mentve: {out_file} ({os.path.getsize(out_file)} bájt)")
