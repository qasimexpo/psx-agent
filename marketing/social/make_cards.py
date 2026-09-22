"""Facebook and Instagram post cards in the site's design, from live data.

    python marketing/social/make_cards.py <output-dir> [SYMBOL ...]

Produces a market card from the latest brief and the home page, one company
card per symbol, an introduction card, a dividend-calculator card for the
first symbol with a declared payout, and the three evergreen feature cards.
Cards are 1080x1350 (4:5), the size Facebook and Instagram show largest on
a phone. Everything on a card is read from smartsarmaya.com at run time, so
a card is only ever as fresh as the site, and never fresher.

Needs Pillow, requests and beautifulsoup4:  pip install pillow requests bs4
"""

from __future__ import annotations

import json
import os
import random
import re
import sys
from datetime import date
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SITE = "https://www.smartsarmaya.com"
FONTS = HERE / "fonts"
UA = {"User-Agent": "Mozilla/5.0 (SmartSarmaya card generator)"}

W, H = 1080, 1350
NAVY = (11, 19, 43)
PANEL = (20, 31, 66)
EMERALD = (16, 185, 129)
MINT = (52, 211, 153)
ROSE = (251, 113, 133)
AMBER = (251, 191, 36)
WHITE = (255, 255, 255)
SLATE = (148, 163, 184)
SLATE2 = (203, 213, 225)
GREEN_PANEL = (9, 60, 46)
RED_PANEL = (70, 24, 34)
AMBER_PANEL = (64, 42, 12)


def font(weight: int, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / f"DMSans-{weight}.ttf"), size)


bold = lambda s: font(700, s)  # noqa: E731
med = lambda s: font(500, s)  # noqa: E731
reg = lambda s: font(400, s)  # noqa: E731

_logo = Image.open(REPO / "frontend/public/images/logo-transparent.png").convert("RGBA")
LOGO = _logo.crop(_logo.getchannel("A").getbbox())


# ---------------------------------------------------------------- live data
def soup(path: str) -> BeautifulSoup:
    return BeautifulSoup(requests.get(SITE + path, headers=UA, timeout=30).text, "html.parser")


def text(el) -> str:
    return el.get_text(" ", strip=True) if el else ""


def fetch_market() -> dict:
    home = soup("/")
    t = home.get_text(" ", strip=True)
    m = re.search(r"KSE-100 Index\s+([\d,\.]+)\s+([-\d,\.]+)\s+\(\s*([-+\d\.]+%)\s*\)", t)
    hub = soup("/brief")
    link = hub.select_one("article a[href^='/brief/']")["href"]
    brief = soup(link)
    article = next(
        json.loads(s.string) for s in brief.find_all("script", type="application/ld+json")
        if json.loads(s.string).get("@type") == "NewsArticle"
    )
    body = " ".join(text(p) for p in brief.select(".brief-body p"))
    points = [text(li) for li in brief.select("ul li") if len(text(li)) > 40][:5]
    gainers = re.findall(r"([A-Z]{2,7})\s*\(\+([\d\.]+)%\)", body)[:3]
    losers = re.findall(r"([A-Z]{2,7})\s+(?:fell|dropped|slipped|lost|declined)\s+([\d\.]+)%", body)
    pair = re.search(r"([A-Z]{2,7}) and ([A-Z]{2,7}) (?:fell|dropped|slipped|lost|declined) ([\d\.]+)% and ([\d\.]+)%", body)
    if pair:
        losers += [(pair.group(1), pair.group(3)), (pair.group(2), pair.group(4))]
    losers = list(dict(losers).items())[:3]
    breadth = re.findall(r"([A-Z][A-Za-z&\s]+?)\s+(?:posted|shows?|leads breadth with|led with)?\s*(\d+)\s+up\s+(?:vs|against|and)\s+(\d+)\s+down", body + " " + " ".join(points))[:3]
    active = re.search(r"most active (?:share|security|stock)\s+was\s+([A-Z]{2,7})\s*,?\s*(up|down|rising|falling|gaining|losing)?\s*([-\d\.]+%)?[^\d]*?([\d,]{6,})", body, re.I)
    return {
        "index": m.group(1) if m else "",
        "index_change": (m.group(2), m.group(3)) if m else ("", ""),
        "headline": article["headline"],
        "session": "morning" if link.endswith("/morning") else "closing",
        "url": link,
        "points": points,
        "gainers": [(s, f"+{p}%") for s, p in gainers],
        "losers": [(s, f"−{p}%") for s, p in losers],
        "breadth": list({n.strip(): (n.strip(), int(u), int(d)) for n, u, d in breadth}.values())[:3],
        "active": (
            active.group(1),
            (("+" if (active.group(2) or "").lower() in ("up", "rising", "gaining") else "−") + active.group(3).lstrip("+-−")) if active and active.group(3) else "",
            active.group(4),
        ) if active else None,
    }


def fetch_stock(sym: str) -> dict:
    s = soup(f"/stock/{sym}")
    hdr = s.select_one("header.card")
    nums = [text(p) for p in hdr.select(".tabular")]
    d = {
        "sym": sym,
        "name": re.sub(r"\s*\(\s*[A-Z0-9]+\s*\)\s*$", "", text(s.find("h1"))),
        "halal": text(s.select_one("main p strong")),
        "is_kmi": text(s.select_one("main p strong")).startswith("Yes"),
        "badges": [text(b) for b in hdr.select(".badge")],
        "sector": text(hdr.select_one("p.mt-2")),
        "price": nums[0],
        "change": re.sub(r"\s*\(\s*", " (", nums[1]).replace(" )", ")"),
        "range": nums[2].split() if len(nums) > 2 else None,
        "tables": {},
        "upcoming": [],
    }
    for tb in s.select("table"):
        d["tables"][text(tb.find("caption"))] = {text(tr.th): text(tr.td) for tr in tb.select("tr")}
    trend = s.find(string=re.compile("Trend:"))
    d["trend"] = text(trend.find_parent("p")).replace("Trend:", "").strip() if trend else ""
    up = s.find(string=re.compile(r"^\s*Upcoming\s*$"))
    if up:
        d["upcoming"] = [text(li) for li in up.find_parent("div").select("li")]
    return d


# ---------------------------------------------------------------- drawing
def base(seed: int) -> Image.Image:
    img = Image.new("RGBA", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    for _ in range(110):
        x, y = rnd.randrange(W), rnd.randrange(H)
        r = rnd.choice([1, 1, 2])
        d.ellipse((x - r, y - r, x + r, y + r), fill=(200, 230, 220, rnd.randrange(50, 150)))
    return img


def header(img: Image.Image, kicker: str) -> ImageDraw.ImageDraw:
    d = ImageDraw.Draw(img)
    tile = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, 63, 63), radius=14, fill=WHITE)
    lg = LOGO.resize((50, int(50 * LOGO.height / LOGO.width)), Image.LANCZOS)
    tile.alpha_composite(lg, ((64 - lg.width) // 2, (64 - lg.height) // 2))
    img.alpha_composite(tile, (64, 60))
    d.text((144, 64), "SmartSarmaya", font=bold(34), fill=WHITE)
    d.text((146, 106), kicker, font=med(20), fill=MINT)
    return d


def footer(img: Image.Image, url: str, note="Written by AI from PSX data. Educational, not financial advice.") -> None:
    d = ImageDraw.Draw(img)
    d.line((64, H - 118, W - 64, H - 118), fill=(255, 255, 255, 40), width=1)
    d.text((64, H - 100), url, font=bold(26), fill=MINT)
    d.text((64, H - 62), note, font=reg(20), fill=SLATE)


def panel(img: Image.Image, box, radius=26, fill=PANEL) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius=radius, fill=fill + (255,), outline=(255, 255, 255, 22), width=1)
    img.alpha_composite(layer)


def chip(img: Image.Image, xy, label: str, fill, fg, fnt=None) -> int:
    fnt = fnt or bold(20)
    d = ImageDraw.Draw(img)
    tw = d.textlength(label, font=fnt)
    x, y = xy
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((x, y, x + tw + 32, y + 40), radius=20, fill=fill)
    img.alpha_composite(layer)
    ImageDraw.Draw(img).text((x + 16, y + 8), label, font=fnt, fill=fg)
    return int(tw + 32)


def tone(s: str):
    s = s.strip()
    return MINT if s.startswith("+") else ROSE if s.startswith(("-", "−")) else SLATE2


def save(img: Image.Image, out: Path, name: str) -> None:
    img.convert("RGB").save(out / name, quality=92, optimize=True)
    print(name, os.path.getsize(out / name) // 1024, "KB")


# ---------------------------------------------------------------- cards
def market_card(m: dict, out: Path, day: date) -> None:
    img = base(1)
    d = header(img, f"PSX · {day.strftime('%A %d %B %Y')} · {m['session']} brief")
    d.text((64, 190), "KSE-100", font=med(30), fill=SLATE2)
    d.text((64, 226), m["index"].split(".")[0], font=bold(132), fill=WHITE)
    pts, pct = m["index_change"]
    if pct:
        w = chip(img, (64, 386), f"     {pts} ({pct})", (16, 185, 129, 56) if not pct.startswith("-") else (251, 113, 133, 56), tone(pct), bold(24))
        d = ImageDraw.Draw(img)
        tri = [(86, 414), (100, 394), (114, 414)] if not pct.startswith("-") else [(86, 394), (100, 414), (114, 394)]
        d.polygon(tri, fill=tone(pct))
    y = 460
    d.text((64, y), m["headline"][:60] + ("…" if len(m["headline"]) > 60 else ""), font=med(26), fill=SLATE2)
    y = 510
    for name, up, down in m["breadth"]:
        panel(img, (64, y, W - 64, y + 78))
        d = ImageDraw.Draw(img)
        d.text((92, y + 22), name[:34], font=med(28), fill=WHITE)
        s = f"{up} up · {down} down"
        d.text((W - 92 - d.textlength(s, font=bold(28)), y + 22), s, font=bold(28), fill=MINT if up >= down else ROSE)
        y += 92
    y += 18
    d.text((64, y), "Movers", font=med(30), fill=SLATE2)
    y += 46
    cols = [("Top gainers", m["gainers"], MINT), ("Top losers", m["losers"], ROSE)]
    cw = (W - 128 - 24) // 2
    for i, (title, rows, col) in enumerate(cols):
        x = 64 + i * (cw + 24)
        panel(img, (x, y, x + cw, y + 190))
        d = ImageDraw.Draw(img)
        d.text((x + 26, y + 20), title, font=med(22), fill=SLATE)
        for j, (sym, pct) in enumerate(rows[:3]):
            yy = y + 62 + j * 40
            d.text((x + 26, yy), sym, font=bold(26), fill=WHITE)
            d.text((x + cw - 26 - d.textlength(pct, font=bold(26)), yy), pct, font=bold(26), fill=col)
    y += 214
    if m["active"]:
        sym, pct, vol = m["active"]
        panel(img, (64, y, W - 64, y + 84))
        d = ImageDraw.Draw(img)
        d.text((92, y + 16), "Most active", font=med(22), fill=SLATE)
        shares = f"{int(vol.replace(',', '')) / 1e6:.1f}M shares"
        d.text((92, y + 44), f"{sym}  {pct}  ·  {shares}", font=bold(26), fill=WHITE)
    footer(img, "smartsarmaya.com/brief")
    save(img, out, f"01-market-{day.isoformat()}.jpg")


def stock_card(s: dict, out: Path) -> None:
    sym = s["sym"]
    img = base(sum(map(ord, sym)))
    d = header(img, f"Company snapshot · {s['sector'].title()}")
    d.text((64, 190), sym, font=bold(96), fill=WHITE)
    x = 64 + int(d.textlength(sym, font=bold(96))) + 24
    styles = {"Shariah compliant": ((16, 185, 129, 60), MINT), "Not KMI listed": ((251, 113, 133, 50), ROSE)}
    for b in s["badges"]:
        fill, fg = styles.get(b, ((255, 255, 255, 24), SLATE2))
        x += chip(img, (x, 236), b, fill, fg) + 10
    d = ImageDraw.Draw(img)
    d.text((64, 300), s["name"][:44], font=med(30), fill=SLATE2)
    d.text((64, 356), f"Rs {s['price']}", font=bold(84), fill=WHITE)
    chg = s["change"]
    if "+" in chg and not chg.startswith(("+", "-")):
        chg = "+" + chg
    d.text((64 + d.textlength(f"Rs {s['price']}", font=bold(84)) + 24, 398), chg, font=bold(34), fill=tone(chg.split("(")[-1]))
    ok = s["is_kmi"]
    panel(img, (64, 470, W - 64, 540), fill=GREEN_PANEL if ok else RED_PANEL)
    d = ImageDraw.Draw(img)
    d.ellipse((92, 496, 110, 514), fill=EMERALD if ok else ROSE)
    d.text((126, 486), s["halal"] + ("  KMI All Shares constituent." if ok else "  Not in the KMI All Shares index."), font=bold(26), fill=(214, 250, 236) if ok else (255, 214, 222))
    tech = s["tables"].get(f"{sym} technical indicators", {})
    perf = s["tables"].get(f"{sym} price change by period", {})
    y = 572
    panel(img, (64, y, W - 64, y + 330))
    d = ImageDraw.Draw(img)
    d.text((92, y + 22), "Technicals · from exchange closing prices", font=med(22), fill=SLATE)
    rows = [("RSI (14)", "RSI (14)"), ("20-day avg", "20-day average"), ("50-day avg", "50-day average"),
            ("200-day avg", "200-day average"), ("Support", "Support"), ("Resistance", "Resistance")]
    for i, (label, key) in enumerate(rows):
        cx = 92 + (i % 3) * 308
        cy = y + 66 + (i // 3) * 92
        d.text((cx, cy), label, font=reg(22), fill=SLATE)
        d.text((cx, cy + 30), tech.get(key, "—"), font=bold(34), fill=WHITE)
    ty = y + 256
    d.text((92, ty), "Trend", font=reg(22), fill=SLATE)
    trend = s["trend"] or "—"
    d.text((172, ty - 4), trend, font=bold(30), fill=MINT if "up" in trend.lower() else ROSE if "down" in trend.lower() else SLATE2)
    if s["range"]:
        lo, hi = s["range"]
        p = float(s["price"].replace(",", ""))
        pos = min(1, max(0, (p - float(lo.replace(",", ""))) / (float(hi.replace(",", "")) - float(lo.replace(",", "")) or 1)))
        d.text((520, ty), "52-week range", font=reg(22), fill=SLATE)
        d.rounded_rectangle((520, ty + 40, W - 92, ty + 48), radius=4, fill=(255, 255, 255, 40))
        px = 520 + int((W - 92 - 520) * pos)
        d.ellipse((px - 10, ty + 34, px + 10, ty + 54), fill=WHITE)
        d.text((520, ty + 58), lo, font=reg(20), fill=SLATE)
        d.text((W - 92 - d.textlength(hi, font=reg(20)), ty + 58), hi, font=reg(20), fill=SLATE)
    y = 924
    cw = (W - 128 - 3 * 16) // 4
    for i, (k, v) in enumerate(list(perf.items())[:4]):
        x = 64 + i * (cw + 16)
        panel(img, (x, y, x + cw, y + 96))
        d = ImageDraw.Draw(img)
        d.text((x + 20, y + 16), k, font=reg(22), fill=SLATE)
        d.text((x + 20, y + 46), v, font=bold(32), fill=tone(v))
    y = 1044
    if s["upcoming"]:
        panel(img, (64, y, W - 64, y + 120), fill=AMBER_PANEL)
        d = ImageDraw.Draw(img)
        d.text((92, y + 16), "Upcoming", font=med(22), fill=AMBER)
        d.text((92, y + 48), s["upcoming"][0][:60], font=bold(26), fill=WHITE)
        if len(s["upcoming"]) > 1:
            d.text((92, y + 84), s["upcoming"][1][:60], font=reg(24), fill=SLATE2)
    footer(img, f"smartsarmaya.com/stock/{sym}")
    save(img, out, f"stock-{sym}.jpg")


def halal_card(out: Path, examples: list[dict], counts: tuple[int, int]) -> None:
    img = base(9)
    d = header(img, "Feature · one-sentence answers")
    d.text((64, 200), "Is it Shariah", font=bold(96), fill=WHITE)
    d.text((64, 310), "compliant?", font=bold(96), fill=MINT)
    d.text((64, 430), "Every company page answers in its first line,", font=reg(30), fill=SLATE2)
    d.text((64, 472), "sourced from the exchange, not from a chatbot.", font=reg(30), fill=SLATE2)
    y = 540
    for s in examples[:3]:
        ok = s["is_kmi"]
        panel(img, (64, y, W - 64, y + 150), fill=GREEN_PANEL if ok else RED_PANEL)
        d = ImageDraw.Draw(img)
        d.ellipse((92, y + 30, 116, y + 54), fill=EMERALD if ok else ROSE)
        d.text((134, y + 24), s["halal"], font=bold(32), fill=WHITE)
        d.text((134, y + 76), ("Constituent" if ok else "Not a constituent") + " of the KMI All Shares Islamic Index", font=reg(24), fill=SLATE2)
        d.text((134, y + 108), "Published by the Pakistan Stock Exchange", font=reg(22), fill=SLATE)
        y += 170
    y += 24
    halal, total = counts
    d.text((64, y), f"{halal} of {total} listed companies pass the screen.", font=bold(30), fill=MINT)
    d.text((64, y + 44), "Search any symbol. Free, no account.", font=reg(28), fill=SLATE2)
    footer(img, "smartsarmaya.com/stocks", "Shariah status reflects index membership, not a religious ruling.")
    save(img, out, "feature-shariah-status.jpg")


def intro_card(out: Path, counts: tuple[int, int]) -> None:
    """Introduction card for groups and first-time readers: what the site does."""
    img = base(11)
    d = header(img, "Free research for the Pakistan Stock Exchange")
    d.text((64, 200), "PSX stock research,", font=bold(76), fill=WHITE)
    d.text((64, 288), "free, no account.", font=bold(76), fill=MINT)
    halal, total = counts
    rows = [
        ("Is it Shariah compliant?", f"Every company page answers in its first line, from the KMI All Shares Islamic Index. {halal} of {total} pass."),
        ("Daily market brief", "Written from exchange data before the open and after the close, every trading day."),
        ("AI picks, on the record", "Shariah-compliant picks for ten sectors, marked to market daily. Every pick stays on a public scorecard."),
        ("Portfolio audit", "Type your holdings; see value, profit and how much of your money is Shariah compliant."),
    ]
    y = 410
    for i, (title, body) in enumerate(rows, 1):
        panel(img, (64, y, W - 64, y + 168))
        d = ImageDraw.Draw(img)
        d.ellipse((92, y + 30, 140, y + 78), fill=EMERALD)
        d.text((116, y + 54), str(i), font=bold(26), fill=NAVY, anchor="mm")
        d.text((164, y + 26), title, font=bold(32), fill=WHITE)
        words, line, ly = body.split(), "", y + 76
        for w in words:
            probe = (line + " " + w).strip()
            if d.textlength(probe, font=reg(24)) > W - 64 - 164 - 26:
                d.text((164, ly), line, font=reg(24), fill=SLATE2)
                line, ly = w, ly + 34
            else:
                line = probe
        d.text((164, ly), line, font=reg(24), fill=SLATE2)
        y += 190
    footer(img, "smartsarmaya.com", "Educational, not financial advice and not a religious ruling.")
    save(img, out, "intro-what-it-does.jpg")


def dividend_card(out: Path, sym: str, price: float, dps: float, pct: int, shares: int) -> None:
    """Worked example of the dividend calculator: what a declared payout actually pays."""
    gross = dps * shares
    wht = gross * 0.15
    img = base(13)
    d = header(img, "Feature · dividend calculator")
    d.text((64, 200), f"{sym} declared a {pct}%", font=bold(72), fill=WHITE)
    d.text((64, 282), "dividend. What do", font=bold(72), fill=WHITE)
    d.text((64, 364), "you actually get?", font=bold(72), fill=MINT)
    d.text((64, 480), f"{pct}% of the Rs 10 par value = Rs {dps:g} per share, not {pct}% of the price.", font=reg(26), fill=SLATE2)
    rows = [
        (f"{shares:,} shares × Rs {dps:g}", f"Rs {gross:,.0f}", "gross dividend", WHITE),
        ("Withholding tax, filer 15%", f"− Rs {wht:,.0f}", "30% if you are not on the ATL", ROSE),
        ("Paid into your account", f"Rs {gross - wht:,.0f}", "net dividend", MINT),
        (f"Yield at Rs {price:,.2f}", f"{dps / price * 100:.1f}%", "gross, on the current price", WHITE),
    ]
    y = 550
    for label, value, note, col in rows:
        panel(img, (64, y, W - 64, y + 122))
        d = ImageDraw.Draw(img)
        d.text((92, y + 22), label, font=med(26), fill=SLATE2)
        d.text((92, y + 62), note, font=reg(22), fill=SLATE)
        d.text((W - 92, y + 40), value, font=bold(40), fill=col, anchor="rm")
        y += 138
    d.text((64, y + 20), "Hold the shares before the book-closure date to receive it.", font=reg(26), fill=SLATE2)
    footer(img, "smartsarmaya.com/calculators", "Filer/non-filer rates as described on the page. Educational, not tax advice.")
    save(img, out, f"feature-dividend-{sym}.jpg")


def audit_card(out: Path) -> None:
    img = base(5)
    d = header(img, "Feature · portfolio audit")
    d.text((64, 200), "Audit your PSX", font=bold(88), fill=WHITE)
    d.text((64, 300), "portfolio in 2 minutes", font=bold(88), fill=MINT)
    d.text((64, 420), "Type what you hold. Get back:", font=reg(30), fill=SLATE2)
    tiles = [("Market value", "at today's price"), ("Profit / loss", "Rs and %"), ("Shariah compliant", "% of your money"), ("Largest sector", "flagged above 40%")]
    cw = (W - 128 - 20) // 2
    for i, (k, v) in enumerate(tiles):
        x = 64 + (i % 2) * (cw + 20)
        y = 480 + (i // 2) * 150
        panel(img, (x, y, x + cw, y + 130))
        d = ImageDraw.Draw(img)
        d.text((x + 26, y + 26), k, font=bold(30), fill=WHITE)
        d.text((x + 26, y + 72), v, font=reg(24), fill=SLATE)
    y = 810
    for line in ["Plus a per-holding card: RSI, support, resistance,", "trend, upcoming dividends and an AI note."]:
        d.text((64, y), line, font=reg(28), fill=SLATE2)
        y += 40
    y += 30
    for line in ["No login.", "Nothing stored.", "Up to 8 holdings per run."]:
        d.ellipse((72, y + 12, 86, y + 26), fill=EMERALD)
        d.text((104, y), line, font=med(28), fill=WHITE)
        y += 46
    footer(img, "smartsarmaya.com/#audit", "Your holdings are used for one request and discarded.")
    save(img, out, "feature-portfolio-audit.jpg")


def record_card(out: Path, tracked: str, in_profit: str) -> None:
    img = base(12)
    d = header(img, "Feature · public track record")
    d.text((64, 200), "Every pick,", font=bold(96), fill=WHITE)
    d.text((64, 306), "on the record.", font=bold(96), fill=MINT)
    for i, line in enumerate(["Each AI pick is saved with its date and price,", "then marked to market every trading day.", "Nothing is deleted when it goes wrong."]):
        d.text((64, 440 + i * 42), line, font=reg(30), fill=SLATE2)
    cw = (W - 128 - 20) // 2
    y = 620
    for i, (k, v) in enumerate([(tracked, "picks tracked"), (in_profit, "currently in profit")]):
        x = 64 + i * (cw + 20)
        panel(img, (x, y, x + cw, y + 150))
        d = ImageDraw.Draw(img)
        d.text((x + 26, y + 22), k, font=bold(64), fill=WHITE)
        d.text((x + 26, y + 100), v, font=reg(24), fill=SLATE)
    y = 820
    for line in ["Screened against the KMI All Shares Islamic Index.", "Ranked by AI. Prices from the exchange, never from the model.", "Ten sectors, three horizons, refreshed every trading morning."]:
        d.ellipse((72, y + 12, 86, y + 26), fill=EMERALD)
        d.text((104, y), line, font=med(26), fill=WHITE)
        y += 48
    d.text((64, y + 30), "A short sample proves very little. That is why it is public.", font=reg(24), fill=SLATE)
    footer(img, "smartsarmaya.com/track-record")
    save(img, out, "feature-track-record.jpg")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    symbols = [s.upper() for s in sys.argv[2:]] or ["PPL", "OGDC"]
    today = date.today()

    market = fetch_market()
    market_card(market, out, today)
    stocks = [fetch_stock(sym) for sym in symbols]
    for s in stocks:
        stock_card(s, out)

    home = soup("/").get_text(" ", strip=True)
    counts = re.search(r"(\d+)\s+Shariah compliant\s+of\s+(\d+)\s+listed", home)
    tracked = re.search(r"(\d+)\s+picks tracked", home)
    profit = re.search(r"([\d\.]+%)\s+in profit", home)
    examples = stocks[:2] + [fetch_stock("HBL")]
    halal_card(out, examples, (int(counts.group(1)), int(counts.group(2))) if counts else (0, 0))
    intro_card(out, (int(counts.group(1)), int(counts.group(2))) if counts else (0, 0))
    for s in stocks:  # dividend card for the first symbol with a declared payout
        payout = next((re.search(r"payout (\d+)%", u) for u in s["upcoming"] if u.startswith("payout")), None)
        if payout:
            pct = int(payout.group(1))
            dividend_card(out, s["sym"], float(s["price"].replace(",", "")), pct / 10, pct, 400)
            break
    audit_card(out)
    record_card(out, tracked.group(1) if tracked else "—", profit.group(1) if profit else "—")


if __name__ == "__main__":
    main()
