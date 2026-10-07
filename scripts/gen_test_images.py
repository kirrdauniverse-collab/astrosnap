"""
Teszt képek generálása az asztrofotó alkalmazás pipeline-jának teszteléséhez.
Generálunk néhány "light" frame-et (csillagos égbolt szimulálása),
valamint dark és flat frame-et.
"""
import numpy as np
from PIL import Image
import os
import random

OUT_DIR = "/home/z/my-project/test-images"
os.makedirs(OUT_DIR, exist_ok=True)

random.seed(42)
np.random.seed(42)

WIDTH = 800
HEIGHT = 800

def generate_stars(width, height, count=300):
    """Véletlenszerű csillagok generálása"""
    img = np.zeros((height, width, 3), dtype=np.float32)
    
    for y in range(height):
        for x in range(width):
            bg_r = 5
            bg_g = 8
            bg_b = 15
            center_y = height // 2 + int(50 * np.sin(x / 200))
            dist = abs(y - center_y)
            milkyway_strength = max(0, 1 - dist / 150)
            bg_r += int(20 * milkyway_strength)
            bg_g += int(15 * milkyway_strength)
            bg_b += int(30 * milkyway_strength)
            img[y, x] = [bg_r, bg_g, bg_b]
    
    for _ in range(count):
        x = random.randint(0, width - 1)
        y = random.randint(0, height - 1)
        brightness = random.uniform(80, 255)
        size = random.uniform(0.5, 3.0)
        color_var = random.uniform(-0.2, 0.2)
        r = brightness * (1 + color_var * 0.1)
        g = brightness
        b = brightness * (1 - color_var * 0.1)
        
        radius = max(1, int(size))
        for dy in range(-radius * 3, radius * 3 + 1):
            for dx in range(-radius * 3, radius * 3 + 1):
                if 0 <= x + dx < width and 0 <= y + dy < height:
                    dist = np.sqrt(dx*dx + dy*dy)
                    if dist < radius * 3:
                        falloff = np.exp(-(dist / radius)**2)
                        img[y + dy, x + dx] += np.array([r, g, b]) * falloff * 0.3
    
    return img

def add_noise(img, sigma=10):
    noise = np.random.normal(0, sigma, img.shape).astype(np.float32)
    return np.clip(img + noise, 0, 255)

def add_vignetting(img, strength=0.3):
    h, w = img.shape[:2]
    Y, X = np.ogrid[:h, :w]
    center_y, center_x = h / 2, w / 2
    dist = np.sqrt((X - center_x)**2 + (Y - center_y)**2) / np.sqrt(center_x**2 + center_y**2)
    mask = 1 - strength * dist**2
    return np.clip(img * mask[:, :, np.newaxis], 0, 255)

def offset_image(img, dx, dy):
    h, w = img.shape[:2]
    out = np.zeros_like(img)
    out[:, :] = 5
    src_y_start = max(0, dy)
    src_y_end = min(h, h + dy)
    src_x_start = max(0, dx)
    src_x_end = min(w, w + dx)
    dst_y_start = max(0, -dy)
    dst_y_end = dst_y_start + (src_y_end - src_y_start)
    dst_x_start = max(0, -dx)
    dst_x_end = dst_x_start + (src_x_end - src_x_start)
    out[dst_y_start:dst_y_end, dst_x_start:dst_x_end] = img[src_y_start:src_y_end, src_x_start:src_x_end]
    return out

print("Light frame-ek generálása...")
base_img = generate_stars(WIDTH, HEIGHT, count=400)
for i in range(5):
    dx = i * 3
    dy = i * 1
    img = offset_image(base_img, dx, dy)
    img = add_noise(img, sigma=15)
    img = add_vignetting(img, strength=0.25)
    img_uint8 = img.astype(np.uint8)
    Image.fromarray(img_uint8).save(os.path.join(OUT_DIR, f"light_{i+1}.png"))
    print(f"  light_{i+1}.png mentve (offset: {dx},{dy})")

print("Dark frame generálása...")
dark = np.random.normal(20, 12, (HEIGHT, WIDTH, 3)).clip(0, 255).astype(np.uint8)
Image.fromarray(dark).save(os.path.join(OUT_DIR, "dark_1.png"))
print("  dark_1.png mentve")

print("Flat frame generálása...")
flat = np.ones((HEIGHT, WIDTH, 3), dtype=np.float32) * 180
flat = add_vignetting(flat, strength=0.2)
flat = add_noise(flat, sigma=3)
flat = flat.clip(0, 255).astype(np.uint8)
Image.fromarray(flat).save(os.path.join(OUT_DIR, "flat_1.png"))
print("  flat_1.png mentve")

print(f"\nKesz! {OUT_DIR} mappaba mentve.")
