"""Shared configuration and constants for the SmartSarmaya pipeline."""

from __future__ import annotations

import logging
import os
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv()

PKT = ZoneInfo("Asia/Karachi")

# --- Branding -------------------------------------------------------------
SITE_NAME = "SmartSarmaya"
SITE_URL = os.environ.get("SITE_URL", "https://www.smartsarmaya.com").rstrip("/")

# --- AI models ------------------------------------------------------------
# Cron work is not latency sensitive, so it uses the larger free Groq model.
# The interactive endpoints in the Next.js app use the small fast one.
#
# Groq retires models regularly. The Llama 3.x names this project used before
# now return 404, which silently broke generation. Each setting is therefore a
# list tried in order, so one retirement degrades quality instead of stopping
# the pipeline. Check https://console.groq.com/docs/models when all of them go.
GROQ_MODEL_QUALITY = os.environ.get("GROQ_MODEL_QUALITY", "openai/gpt-oss-120b")
GROQ_MODEL_FAST = os.environ.get("GROQ_MODEL_FAST", "openai/gpt-oss-20b")

# Verified against the free tier on 5 Sep 2026: the gpt-oss models allow 8000
# tokens per minute, which comfortably fits a sector generation. Qwen is
# deliberately excluded because its 1000 output-tokens-per-minute cap rejects
# every request this pipeline makes.
GROQ_QUALITY_FALLBACKS = (
    GROQ_MODEL_QUALITY,
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "groq/compound-mini",
)
GROQ_FAST_FALLBACKS = (
    GROQ_MODEL_FAST,
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "groq/compound-mini",
)

# Groq's free tier allows 8000 tokens a minute. One sector generation uses
# roughly 5,600, so sector calls are spaced out rather than issued back to back.
PICKS_PAUSE_SECONDS = int(os.environ.get("PICKS_PAUSE_SECONDS", "30"))

GEMINI_FALLBACK_MODELS = ("gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash")

# --- Coverage -------------------------------------------------------------
# Sectors surfaced in the Top Halal Picks selector. Names are display labels;
# symbols are resolved from the live PSX sector codes at runtime.
PICK_SECTORS = (
    "Banking (Islamic)",
    "Cement",
    "Energy (E&P)",
    "Power Generation",
    "Technology",
    "Fertilizer",
    "Pharmaceuticals",
    "Automobile",
    "Textile",
    "Food & Personal Care",
)
SECTOR_ALL = "All"
PICK_TIMEFRAMES = ("daily", "monthly", "yearly")
PICKS_PER_SECTOR = 3

# PSX sector codes (verified live against /sector-summary/sectorwise) mapped to
# our display sectors. A symbol qualifies for a pick sector when its PSX sector
# code is listed here AND it is a constituent of KMIALLSHR, so "Banking
# (Islamic)" resolves to Islamic banks without needing a hand-maintained list.
SECTOR_CODE_MAP: dict[str, tuple[str, ...]] = {
    "Banking (Islamic)": ("0807",),  # COMMERCIAL BANKS, narrowed by KMI membership
    "Cement": ("0804",),
    "Energy (E&P)": ("0820", "0821", "0825"),  # EXPLORATION, MARKETING, REFINERY
    "Power Generation": ("0824",),
    "Technology": ("0828",),
    "Fertilizer": ("0809",),
    "Pharmaceuticals": ("0823",),
    "Automobile": ("0801", "0802"),
    "Textile": ("0829", "0830", "0831"),
    "Food & Personal Care": ("0810",),
}

# Human readable names for PSX sector codes, used on stock pages.
SECTOR_CODE_NAMES: dict[str, str] = {
    "0801": "Automobile Assembler",
    "0802": "Automobile Parts & Accessories",
    "0803": "Cable & Electrical Goods",
    "0804": "Cement",
    "0805": "Chemical",
    "0806": "Close-End Mutual Fund",
    "0807": "Commercial Banks",
    "0808": "Engineering",
    "0809": "Fertilizer",
    "0810": "Food & Personal Care Products",
    "0811": "Glass & Ceramics",
    "0812": "Insurance",
    "0813": "Inv. Banks / Inv. Cos. / Securities Cos.",
    "0814": "Jute",
    "0815": "Leasing Companies",
    "0816": "Leather & Tanneries",
    "0818": "Miscellaneous",
    "0819": "Modarabas",
    "0820": "Oil & Gas Exploration Companies",
    "0821": "Oil & Gas Marketing Companies",
    "0822": "Paper, Board & Packaging",
    "0823": "Pharmaceuticals",
    "0824": "Power Generation & Distribution",
    "0825": "Refinery",
    "0826": "Sugar & Allied Industries",
    "0827": "Synthetic & Rayon",
    "0828": "Technology & Communication",
    "0829": "Textile Composite",
    "0830": "Textile Spinning",
    "0831": "Textile Weaving",
    "0832": "Tobacco",
    "0833": "Transport",
    "0834": "Vanaspati & Allied Industries",
    "0835": "Woollen",
    "0836": "Real Estate Investment Trust",
    "0837": "Exchange Traded Funds",
    "0838": "Property",
    "0839": "Apparel",
}

# Number of symbols per stock detail page refresh batch (weekly job).
STOCK_PAGE_BATCH = 40

# How many trading days of end-of-day history to keep per symbol.
EOD_HISTORY_DAYS = 400


def setup_logging(name: str = "smartsarmaya") -> logging.Logger:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    return logging.getLogger(name)
