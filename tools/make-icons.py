#!/usr/bin/env python3
"""Regenerate the PWA icons: the tangerine mic on the indigo stage.

    python3 tools/make-icons.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "icons")

INK_TOP = (42, 30, 92)
INK_BOTTOM = (20, 14, 49)
TANGERINE = (255, 122, 61)
PAPER = (255, 246, 233)


def rounded_bg(size, radius_ratio):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    grad = Image.new("RGBA", (1, size))
    for y in range(size):
        k = y / max(1, size - 1)
        grad.putpixel((0, y), tuple(
            round(INK_TOP[i] + (INK_BOTTOM[i] - INK_TOP[i]) * k) for i in range(3)
        ) + (255,))
    grad = grad.resize((size, size))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=round(size * radius_ratio), fill=255
    )
    img.paste(grad, (0, 0), mask)
    return img


def draw_mic(img, size, inset):
    """Mic glyph centred in a tangerine disc. `inset` leaves maskable padding."""
    d = ImageDraw.Draw(img)
    s = size * (1 - inset * 2)
    cx = size / 2
    cy = size / 2
    disc = s * 0.37
    d.ellipse((cx - disc, cy - disc, cx + disc, cy + disc), fill=TANGERINE)

    body_w = s * 0.17
    body_h = s * 0.33
    body_top = cy - s * 0.26
    d.rounded_rectangle(
        (cx - body_w / 2, body_top, cx + body_w / 2, body_top + body_h),
        radius=body_w / 2, fill=PAPER,
    )

    cradle_w = s * 0.40
    stroke = max(2, round(s * 0.055))
    top = cy - s * 0.12
    d.arc(
        (cx - cradle_w / 2, top, cx + cradle_w / 2, top + cradle_w * 0.9),
        start=0, end=180, fill=PAPER, width=stroke,
    )
    stem_top = top + cradle_w * 0.45
    d.rounded_rectangle(
        (cx - stroke / 2, stem_top, cx + stroke / 2, stem_top + s * 0.12),
        radius=stroke / 2, fill=PAPER,
    )
    foot_w = s * 0.17
    foot_y = stem_top + s * 0.12
    d.rounded_rectangle(
        (cx - foot_w / 2, foot_y - stroke / 2, cx + foot_w / 2, foot_y + stroke / 2),
        radius=stroke / 2, fill=PAPER,
    )


def build(size, path, radius_ratio=0.22, inset=0.0):
    canvas = 1024
    img = rounded_bg(canvas, radius_ratio)
    draw_mic(img, canvas, inset)
    img.resize((size, size), Image.LANCZOS).save(path)
    print("wrote", os.path.relpath(path, HERE))


os.makedirs(OUT, exist_ok=True)
build(192, os.path.join(OUT, "icon-192.png"))
build(512, os.path.join(OUT, "icon-512.png"))
# Maskable: full-bleed background, glyph pulled inside the 80% safe zone.
build(512, os.path.join(OUT, "icon-maskable-512.png"), radius_ratio=0.5, inset=0.12)
