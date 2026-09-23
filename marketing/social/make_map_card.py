"""A share card of the day's market map.

    python marketing/social/make_map_card.py <output-dir>

Screenshots the live market map and sets it into a 1080x1350 card in the
site's design, with the session's headline numbers above it. The map is
photographed rather than redrawn, so the card can never disagree with the
page: whatever the site says today is what the card shows.

Needs the Playwright venv and the packages make_cards.py uses. CHROME_EXE
can point at a Chrome binary if the bundled one is not installed.
"""

from __future__ import annotations

import os
import re
import sys
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import make_cards as mc  # noqa: E402

URL = f"{mc.SITE}/market-map"


def capture(out: Path) -> tuple[Path, dict[str, str]]:
    """The map as a PNG, plus the stat values read from the rendered page."""
    shot = out / "_map.png"
    launch: dict[str, object] = {"headless": True}
    if os.environ.get("CHROME_EXE"):
        launch["executable_path"] = os.environ["CHROME_EXE"]

    with sync_playwright() as p:
        browser = p.chromium.launch(**launch)
        page = browser.new_page(viewport={"width": 1400, "height": 1100}, device_scale_factor=2)
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(500)

        # The wide layout, not the phone one: it carries all hundred companies.
        page.locator("figure > div").first.screenshot(path=str(shot))

        text = page.locator("section").first.inner_text()
        stats = {
            "as_of": _find(r"Prices as of ([^\n]+)", text),
            "index": _find(r"KSE-100 index\s*\n\s*([\d,\.]+)", text),
            "change": _find(r"([+-][\d\.]+%)\s*\n?\s*since the previous close", text),
            "breadth": _find(r"Advances / declines\s*\n\s*([\d]+ / [\d]+)", text),
            "unchanged": _find(r"(\d+ unchanged, of \d+ that traded)", text),
            "volume": _find(r"Volume\s*\n\s*([\d\.]+ mn)", text),
            "value": _find(r"Value traded\s*\n\s*(PKR [\d\.]+ bn)", text),
        }
        browser.close()
    return shot, stats


def _find(pattern: str, text: str) -> str:
    match = re.search(pattern, text)
    return match.group(1).strip() if match else ""


def card(out: Path, shot: Path, stats: dict[str, str], day: date) -> None:
    img = mc.base(23)
    d = mc.header(img, f"PSX · {day.strftime('%A %d %B %Y')} · market map")

    d.text((64, 186), "The whole market,", font=mc.bold(72), fill=mc.WHITE)
    d.text((64, 268), "one picture", font=mc.bold(72), fill=mc.MINT)

    # The index leads, the rest support it.
    d.text((64, 378), "KSE-100", font=mc.med(24), fill=mc.SLATE)
    d.text((64, 410), stats["index"] or "—", font=mc.bold(58), fill=mc.WHITE)
    if stats["change"]:
        up = not stats["change"].startswith("-")
        width = int(d.textlength(stats["index"], font=mc.bold(58)))
        d.text(
            (64 + width + 22, 438),
            stats["change"],
            font=mc.bold(30),
            fill=mc.MINT if up else mc.ROSE,
        )

    pairs = [
        ("Advances / declines", stats["breadth"]),
        ("Volume", stats["volume"]),
        ("Value traded", stats["value"]),
    ]
    x = 64
    cell = (mc.W - 128 - 2 * 16) // 3
    for label, value in pairs:
        mc.panel(img, (x, 492, x + cell, 492 + 92))
        d = ImageDraw.Draw(img)
        d.text((x + 20, 506), label, font=mc.reg(20), fill=mc.SLATE)
        d.text((x + 20, 534), value or "—", font=mc.bold(30), fill=mc.WHITE)
        x += cell + 16

    # The map, scaled to the space that is actually left rather than to the
    # card's width: fitting only the width pushed the caption through the
    # footer rule on a landscape screenshot.
    MAP_TOP = 616
    CAPTION_Y = 1188  # the footer rule sits at H - 118
    picture = Image.open(shot).convert("RGB")
    box_w, box_h = mc.W - 128, CAPTION_Y - MAP_TOP - 22
    scale = min(box_w / picture.width, box_h / picture.height)
    width, height = round(picture.width * scale), round(picture.height * scale)
    img.alpha_composite(
        picture.resize((width, height), Image.LANCZOS).convert("RGBA"),
        ((mc.W - width) // 2, MAP_TOP),
    )

    d = ImageDraw.Draw(img)
    d.text(
        (64, CAPTION_Y),
        "Each tile is one company: size is the day's value traded, colour is its move.",
        font=mc.reg(22),
        fill=mc.SLATE2,
    )

    mc.footer(
        img,
        "smartsarmaya.com/market-map",
        f"From PSX data{', ' + stats['as_of'] if stats['as_of'] else ''}. Educational, not financial advice.",
    )
    mc.save(img, out, f"market-map-{day.isoformat()}.jpg")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    shot, stats = capture(out)
    print({k: v for k, v in stats.items()})
    card(out, shot, stats, date.today())
    shot.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
