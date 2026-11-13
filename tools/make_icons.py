#!/usr/bin/env python3
"""生成 PWA 图标（需要 Pillow）：朱砂底、米色圆、楷体"文"字；无中文字体时退回几何图形。"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")
FONTS = ["/System/Library/Fonts/STHeiti Medium.ttc", "/System/Library/AssetsV2/com_apple_MobileAsset_Font7/*/AssetData/Kaiti.ttc", "/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/Supplemental/Songti.ttc"]


def font(size):
    import glob
    for pat in FONTS:
        for p in glob.glob(pat):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return None


def make(size):
    im = Image.new("RGB", (size, size), (156, 43, 31))
    d = ImageDraw.Draw(im)
    r = int(size * 0.36)
    c = size // 2
    d.ellipse([c - r, c - r, c + r, c + r], fill=(244, 237, 221))
    f = font(int(size * 0.42))
    if f:
        d.text((c, c), "文", font=f, fill=(43, 38, 32), anchor="mm")
    else:
        d.rectangle([c - r // 3, c - r // 2, c + r // 3, c + r // 2], fill=(43, 38, 32))
    return im


os.makedirs(OUT, exist_ok=True)
for s in (192, 512):
    make(s).save(os.path.join(OUT, f"icon-{s}.png"))
with open(os.path.join(OUT, "icon.svg"), "w", encoding="utf-8") as f:
    f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#9c2b1f"/>'
            '<circle cx="50" cy="50" r="36" fill="#f4eddd"/><text x="50" y="52" font-size="44" text-anchor="middle" dominant-baseline="middle" '
            'font-family="Kaiti SC, STKaiti, serif" fill="#2b2620">文</text></svg>')
print("icons ok")
