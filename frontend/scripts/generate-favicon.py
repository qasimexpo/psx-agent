"""Generate SmartSarmaya favicon set — optimized for clarity at 16–32px."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
APP = ROOT / "src" / "app"

NAVY = (11, 19, 43, 255)
EMERALD = (16, 185, 129, 255)
EMERALD_LIGHT = (52, 211, 153, 255)


def _pt(size: int, x: float, y: float) -> tuple[int, int]:
    return int(round(x * size)), int(round(y * size))


def _arrow_polygon(size: int) -> list[tuple[int, int]]:
    """Single filled arrow — reads clearly even at 16px."""
    return [
        _pt(size, 0.20, 0.80),
        _pt(size, 0.36, 0.80),
        _pt(size, 0.54, 0.56),
        _pt(size, 0.68, 0.70),
        _pt(size, 0.84, 0.22),
        _pt(size, 0.62, 0.34),
        _pt(size, 0.48, 0.50),
    ]


def draw_mark(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = max(1, size // 16)
    radius = max(2, size // 5)

    draw.rounded_rectangle(
        [pad, pad, size - pad - 1, size - pad - 1],
        radius=radius,
        fill=NAVY,
    )

    if size >= 24:
        border_w = max(1, size // 32)
        draw.rounded_rectangle(
            [pad, pad, size - pad - 1, size - pad - 1],
            radius=radius,
            outline=EMERALD,
            width=border_w,
        )

    arrow = _arrow_polygon(size)
    draw.polygon(arrow, fill=EMERALD)

    if size >= 64:
        # Highlight on arrow head for larger assets only
        head = [
            _pt(size, 0.68, 0.70),
            _pt(size, 0.84, 0.22),
            _pt(size, 0.62, 0.34),
        ]
        draw.polygon(head, fill=EMERALD_LIGHT)

    return img


def render_mark(size: int) -> Image.Image:
    """Render at native size for favicons; supersample mid sizes."""
    if size <= 16:
        return draw_mark(size)
    if size <= 32:
        hi = draw_mark(size * 4)
        return hi.resize((size, size), Image.Resampling.LANCZOS)
    return draw_mark(size)


def save_all() -> None:
    sizes: dict[str, tuple[int, ...]] = {
        str(APP / "icon.png"): (32,),
        str(PUBLIC / "icon-192.png"): (192,),
        str(PUBLIC / "icon-512.png"): (512,),
        str(PUBLIC / "apple-icon.png"): (180,),
    }

    for path, dims in sizes.items():
        img = render_mark(dims[0])
        img.save(path, format="PNG", optimize=True)
        print(f"Wrote {path}")

    ico_sizes = [16, 32, 48]
    ico_images = [render_mark(s) for s in ico_sizes]

    for path in (APP / "favicon.ico", PUBLIC / "favicon.ico"):
        ico_images[0].save(
            path,
            format="ICO",
            sizes=[(s, s) for s in ico_sizes],
            append_images=ico_images[1:],
        )
        print(f"Wrote {path}")


if __name__ == "__main__":
    save_all()
