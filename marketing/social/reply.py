"""Paste-ready replies for "check XYZ" comments in Facebook groups.

    python marketing/social/reply.py OGDC LUCK MARI

Prints, for each symbol, a short English and a Roman Urdu comment built
from the live company page: Shariah status, latest price and change, trend,
RSI, the next corporate action if any, and the page link. Nothing is
posted; Facebook removed group posting from its API, so the comment is
pasted by hand from a personal profile.
"""

from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_cards import fetch_stock  # noqa: E402


def tidy_event(raw: str) -> str:
    """'payout 60% (F) (D), book closure 2026-10-09' -> '60% final dividend, book closure 9 Oct 2026'."""
    out = raw.replace("payout ", "")
    for code, word in (
        ("(F) (D)", "final dividend"),
        ("(I) (D)", "interim dividend"),
        ("(F) (B)", "final bonus"),
        ("(I) (B)", "interim bonus"),
        ("(D)", "dividend"),
        ("(B)", "bonus"),
        ("(R)", "right shares"),
    ):
        out = out.replace(code, word)
    out = re.sub(
        r"(\d{4})-(\d{2})-(\d{2})",
        lambda m: date(int(m[1]), int(m[2]), int(m[3])).strftime("%d %b %Y").lstrip("0"),
        out,
    )
    out = re.sub(r"%(?=[a-z])", "% ", out)
    return re.sub(r"\s+", " ", out).strip()


def reply(sym: str) -> str:
    s = fetch_stock(sym)
    ok = s["is_kmi"]
    tech = next((v for k, v in s["tables"].items() if "technical" in k), {})
    rsi = tech.get("RSI (14)")
    status_en = (
        "is a constituent of the KMI All Shares Islamic Index, so it passes PSX's own Shariah screen"
        if ok
        else "is not in the KMI All Shares Islamic Index, so it does not pass PSX's Shariah screen"
    )
    status_ur = (
        "KMI All Shares Islamic Index mein shamil hai, yani PSX ki apni Shariah screening pass karta hai"
        if ok
        else "KMI All Shares Islamic Index mein nahi hai, yani PSX ki Shariah screening pass nahi karta"
    )
    change = s["change"] if s["change"].startswith(("-", "−", "+")) else "+" + s["change"]
    bits = [f"Price Rs {s['price']}, {change}"]
    if s["trend"]:
        bits.append(f"trend: {s['trend'].lower()}")
    if rsi:
        bits.append(f"RSI {rsi}")
    nxt = f" Next: {tidy_event(s['upcoming'][0])}." if s["upcoming"] else ""
    link = f"smartsarmaya.com/stock/{sym}"
    en = (
        f"{sym} {status_en}. {', '.join(bits)}.{nxt} "
        f"Full page with technicals, peers and dividend dates: {link} — educational only, not advice."
    )
    ur = (
        f"{sym} {status_ur}. {', '.join(bits)}.{nxt} "
        f"Poora page (technicals, peers, dividend dates): {link} — sirf educational, advice nahi."
    )
    return f"=== {sym} · {s['name']} ===\n{en}\n\n{ur}\n"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for sym in sys.argv[1:]:
        try:
            print(reply(sym.upper()))
        except Exception as exc:  # a delisted or mistyped symbol
            print(f"=== {sym.upper()} ===\nCould not read the page ({exc}). Is the symbol right?\n")
