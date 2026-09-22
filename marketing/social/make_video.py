"""A 9-second screen recording of the portfolio audit on the live site.

    python marketing/social/make_video.py <output-dir> [SYM:price:qty ...]

Records the audit form being filled in and the result appearing, at
1080x1350 (4:5) with phone-sized text, captions in a band below the page
and an end card in the site's design. Output: <output-dir>/audit-demo.mp4.

Needs the Playwright venv (python -m playwright install chromium) and
ffmpeg on PATH. CHROME_EXE can point at a Chrome/Chromium binary if the
bundled one is not installed.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import make_cards as mc  # noqa: E402

SITE = "https://www.smartsarmaya.com"
DEFAULT_HOLDINGS = [("OGDC", "290", "300"), ("PPL", "215", "400"), ("HBL", "280", "100")]
FPS = 30
UA_PHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


def record(out: Path, holdings: list[tuple[str, str, str]]) -> tuple[list[tuple[str, float]], int]:
    """Screenshot after every keystroke and scroll step. Returns (frames, split)."""
    frames_dir = out / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    frames: list[tuple[str, float]] = []

    def shot(page, dur: float) -> None:
        path = frames_dir / f"{len(frames):05d}.png"
        page.screenshot(path=str(path))
        frames.append((path.name, dur))

    def type_into(page, locator, text: str, dur: float = 0.075) -> None:
        locator.focus()  # not click(): CSS zoom throws Playwright's pointer maths off
        for ch in text:
            locator.press(ch)
            shot(page, dur)

    with sync_playwright() as p:
        launch = {"headless": True}
        if os.environ.get("CHROME_EXE"):
            launch["executable_path"] = os.environ["CHROME_EXE"]
        browser = p.chromium.launch(**launch)
        ctx = browser.new_context(
            viewport={"width": 540, "height": 675}, device_scale_factor=2,
            is_mobile=True, has_touch=True, user_agent=UA_PHONE,
        )
        page = ctx.new_page()
        page.goto(f"{SITE}/#audit", wait_until="networkidle")
        page.add_style_tag(content="html{zoom:1.35;overflow-x:hidden}")
        for _ in range(12):  # hash navigation re-scrolls after hydration; insist on the form
            page.evaluate(
                "const r=document.querySelector('#audit').getBoundingClientRect();"
                "window.scrollTo({top: window.scrollY + r.top - 24, left: 0})"
            )
            page.wait_for_timeout(350)
            if -10 < page.evaluate("document.querySelector('#audit').getBoundingClientRect().top") < 200:
                break
        shot(page, 0.7)
        for i, (sym, price, qty) in enumerate(holdings):
            if i > 0:
                page.get_by_role("button", name="Add holding").dispatch_event("click")
                page.wait_for_timeout(150)
                shot(page, 0.2)
            row = page.locator("#audit form .grid.gap-3").nth(i)
            type_into(page, page.locator(f"#symbol-{i}"), sym)
            page.keyboard.press("Escape")
            type_into(page, row.get_by_placeholder("Buy price"), price)
            type_into(page, row.get_by_placeholder("Quantity"), qty)
            shot(page, 0.15)
        shot(page, 0.25)
        page.get_by_role("button", name="Run free audit").dispatch_event("click")
        page.wait_for_timeout(120)
        shot(page, 0.6)  # "Analysing" spinner
        split = len(frames)  # the loading wait is cut here
        page.locator("#audit-result").wait_for(state="visible", timeout=90000)
        page.wait_for_timeout(300)
        page.evaluate(
            "const r=document.querySelector('#audit-result').getBoundingClientRect();"
            "window.scrollTo({top: window.scrollY + r.top - 16, left: 0})"
        )
        page.wait_for_timeout(200)
        shot(page, 1.0)  # the four tiles
        for _ in range(26):
            page.evaluate("window.scrollBy(0, 28)")
            page.wait_for_timeout(20)
            shot(page, 0.06)
        shot(page, 1.0)
        browser.close()
    return frames, split


def concat_list(out: Path, name: str, frames: list[tuple[str, float]]) -> Path:
    # Equal 1/FPS entries: ffmpeg's concat demuxer mishandles a long final duration.
    path = out / f"{name}.txt"
    with open(path, "w") as f:
        for file, dur in frames:
            f.write(f"file 'frames/{file}'\nduration {1 / FPS:.6f}\n" * max(1, round(dur * FPS)))
    return path


def end_card(out: Path) -> Path:
    img = mc.base(21)
    d = mc.header(img, "Feature · portfolio audit")
    d.text((64, 420), "Audit your PSX", font=mc.bold(96), fill=mc.WHITE)
    d.text((64, 530), "portfolio, free.", font=mc.bold(96), fill=mc.MINT)
    y = 700
    for line in ["No login.", "Nothing stored.", "Results in seconds."]:
        d.ellipse((72, y + 14, 90, y + 32), fill=mc.EMERALD)
        d.text((110, y), line, font=mc.med(40), fill=mc.WHITE)
        y += 64
    mc.footer(img, "smartsarmaya.com/#audit", "Educational, not financial advice.")
    path = out / "end.png"
    img.convert("RGB").save(path)
    return path


def assemble(out: Path, seg_a: Path, seg_b: Path, end: Path) -> Path:
    font = (HERE / "fonts" / "DMSans-700.ttf").as_posix().replace(":", r"\:")
    caption = (
        "drawtext=fontfile='{font}':text='{text}':fontsize=44:fontcolor=white:x=(w-text_w)/2:y=1256"
    )
    page = f"fps={FPS},scale=920:1150:flags=lanczos,pad=1080:1350:80:56:0x0B132B"
    graph = ";".join([
        f"[0:v]{page},{caption.format(font=font, text='1. Type what you hold')}[a]",
        f"[1:v]{page},fade=t=in:d=0.2,{caption.format(font=font, text=r'2. Value\, P/L\, Shariah-compliant %\, sector risk')}[b]",
        f"[2:v]scale=1080:1350,fps={FPS},fade=t=in:d=0.25,format=yuv420p[c]",
        "[a][b][c]concat=n=3:v=1:a=0,format=yuv420p[v]",
    ])
    target = out / "audit-demo.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y",
         "-f", "concat", "-safe", "0", "-i", str(seg_a),
         "-f", "concat", "-safe", "0", "-i", str(seg_b),
         "-loop", "1", "-t", "1.3", "-i", str(end),
         "-filter_complex", graph, "-map", "[v]",
         "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", str(target)],
        check=True, cwd=out,
    )
    return target


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    holdings = [tuple(a.upper().split(":")) for a in sys.argv[2:]] or DEFAULT_HOLDINGS  # type: ignore[misc]
    frames, split = record(out, holdings)
    seg_a = concat_list(out, "segA", frames[:split])
    seg_b = concat_list(out, "segB", frames[split:])
    target = assemble(out, seg_a, seg_b, end_card(out))
    seconds = sum(max(1, round(d * FPS)) for _, d in frames) / FPS + 1.3
    print(f"{target}  ({os.path.getsize(target) // 1024} KB, ~{seconds:.1f} s)")


if __name__ == "__main__":
    main()
