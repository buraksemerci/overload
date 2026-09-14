"""PWA ikonlarini uretir — harici bagimlilik YOK.

Pillow ya da bir SVG isleyici eklemek yerine PNG'yi elle yaziyoruz: ikon
tasarimi zaten cok basit (koyu zemin + civit mavisi halter plakasi glifi) ve
bunun icin projeye 3 MB'lik bir goruntu kutuphanesi eklemek orantisiz olurdu.

PNG yapisi: imza + IHDR + IDAT (zlib ile sikistirilmis ham pikseller) + IEND.
Her satir bir "filter byte" ile basliyor (0 = filtre yok).

Kullanim:
    python scripts/generate_icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "apps" / "web" / "public"

# Bolum 7'deki tasarim dili renkleri.
GROUND = (0x17, 0x17, 0x1A)
ACCENT = (0x6E, 0x62, 0xE5)
INK = (0xF2, 0xF2, 0xF0)

Pixel = tuple[int, int, int]


def _chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, pixels: list[list[Pixel]]) -> None:
    height = len(pixels)
    width = len(pixels[0])

    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filtre tipi: yok
        for r, g, b in row:
            raw += bytes((r, g, b))

    png = b"\x89PNG\r\n\x1a\n"
    # bit derinligi 8, renk tipi 2 (truecolor), sikistirma/filtre/interlace 0
    png += _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += _chunk(b"IEND", b"")

    path.write_bytes(png)


def draw_icon(size: int, *, maskable: bool) -> list[list[Pixel]]:
    """Halter plakasi glifi.

    `maskable=True` oldugunda glif kucultuluyor: Android ikonu daire/kare
    maskelerle kirpiyor ve kenara yakin pikseller kesiliyor. Guvenli bolge
    merkezdeki %80'lik alan.
    """
    canvas = [[GROUND for _ in range(size)] for _ in range(size)]

    scale = 0.62 if maskable else 0.78
    span = size * scale
    center = size / 2

    # Bar: yatay ince cubuk
    bar_height = max(2, round(size * 0.055))
    bar_top = round(center - bar_height / 2)
    bar_left = round(center - span / 2)
    bar_right = round(center + span / 2)

    for y in range(bar_top, bar_top + bar_height):
        for x in range(bar_left, bar_right):
            canvas[y][x] = INK

    # Plakalar: barin iki ucunda dikey dikdortgenler.
    # Ic plaka disaridakinden uzun — gercek bir halterin siluetine yakin.
    plate_specs = [
        (0.46, 0.085),  # ic plaka: yukseklik orani, genislik orani
        (0.30, 0.070),  # dis plaka
    ]
    offset = 0.0
    for height_ratio, width_ratio in plate_specs:
        plate_height = round(span * height_ratio)
        plate_width = max(2, round(span * width_ratio))
        top = round(center - plate_height / 2)

        for side in (-1, 1):
            if side < 0:
                x0 = bar_left + round(offset * span)
            else:
                x0 = bar_right - round(offset * span) - plate_width
            for y in range(top, top + plate_height):
                for x in range(x0, x0 + plate_width):
                    if 0 <= x < size and 0 <= y < size:
                        canvas[y][x] = ACCENT
        offset += 0.11

    return canvas


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
        ("apple-icon.png", 180, False),
    ]
    for name, size, maskable in targets:
        path = OUT_DIR / name
        write_png(path, draw_icon(size, maskable=maskable))
        print(f"{name:26} {size}x{size}  {path.stat().st_size:>6} bayt")


if __name__ == "__main__":
    main()
