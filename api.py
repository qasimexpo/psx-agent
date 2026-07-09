"""
PSX AI FastAPI backend — stateless portfolio analysis and top picks.
"""

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from service import (
    analyze_portfolio,
    analyze_single_stock,
    generate_top_picks,
    get_dividend_calendar,
    get_market_index,
    get_market_ticker,
    get_news,
    get_symbol_suggestions,
)

app = FastAPI(title="SmartSarmaya API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ShareInput(BaseModel):
    symbol: str
    buy_price: float = Field(gt=0)
    quantity: int = Field(gt=0)


class PortfolioRequest(BaseModel):
    shares: list[ShareInput] = Field(min_length=1, max_length=5)


class HoldingRow(BaseModel):
    symbol: str
    quantity: int
    buy_price: float
    live_price: float | None = None
    pl_pkr: float | None = None
    rsi: float | None = None
    ai_action: str


class AnalyzePortfolioResponse(BaseModel):
    report_html: str
    report_date: str
    holdings: list[HoldingRow]
    risk_summary: str


class PickCard(BaseModel):
    symbol: str
    sector: str
    summary: str
    why: str
    outlook_short: str
    outlook_long: str
    buy_zone: str
    current_price: str
    exit_target: str


class TopPicksResponse(BaseModel):
    report_html: str
    daily_picks: list[PickCard]
    monthly_picks: list[PickCard]
    yearly_picks: list[PickCard]


class NewsItem(BaseModel):
    title: str
    snippet: str
    source: str
    link: str


class NewsResponse(BaseModel):
    pakistan: list[NewsItem]
    global_news: list[NewsItem] = Field(serialization_alias="global")

    model_config = {"populate_by_name": True}


class MarketIndexResponse(BaseModel):
    name: str
    value: float
    change: float
    change_pct: float
    sparkline: list[float]


class SymbolSuggestion(BaseModel):
    symbol: str
    name: str
    sector: str


class SymbolSearchResponse(BaseModel):
    results: list[SymbolSuggestion]


class SingleStockRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)


class SingleStockAnalyzeResponse(BaseModel):
    symbol: str
    current_price: str
    target_price: str
    weightage_recommendation: str
    future_outlook: str
    action: str


class MarketTickerItem(BaseModel):
    symbol: str
    current_price: float
    high: float
    low: float
    change: float
    direction: str


class DividendCalendarItem(BaseModel):
    symbol: str
    event_type: str
    details: str
    date: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze_portfolio", response_model=AnalyzePortfolioResponse)
def analyze_portfolio_endpoint(request: PortfolioRequest) -> AnalyzePortfolioResponse:
    try:
        shares = [share.model_dump() for share in request.shares]
        result = analyze_portfolio(shares)
        return AnalyzePortfolioResponse(**result)
    except ValueError as exc:
        message = str(exc)
        if "GEMINI_API_KEY" in message:
            raise HTTPException(status_code=503, detail=message) from exc
        if "temporarily unavailable" in message.lower():
            raise HTTPException(status_code=503, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate portfolio report.",
        ) from exc


@app.get("/top_picks", response_model=TopPicksResponse)
def top_picks_endpoint() -> TopPicksResponse:
    try:
        result = generate_top_picks()
        return TopPicksResponse(**result)
    except ValueError as exc:
        message = str(exc)
        if "GEMINI_API_KEY" in message:
            raise HTTPException(status_code=503, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate top picks report.",
        ) from exc


@app.get("/news", response_model=NewsResponse)
def news_endpoint() -> NewsResponse:
    try:
        data = get_news()
        return NewsResponse(
            pakistan=[NewsItem(**item) for item in data["pakistan"]],
            global_news=[NewsItem(**item) for item in data["global"]],
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch news.",
        ) from exc


@app.get("/market_index", response_model=MarketIndexResponse)
def market_index_endpoint() -> MarketIndexResponse:
    try:
        return MarketIndexResponse(**get_market_index())
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch market index.",
        ) from exc


@app.get("/market_ticker", response_model=list[MarketTickerItem])
def market_ticker_endpoint() -> list[MarketTickerItem]:
    try:
        return [MarketTickerItem(**item) for item in get_market_ticker()]
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch market ticker data.",
        ) from exc


@app.get("/dividend_calendar", response_model=list[DividendCalendarItem])
def dividend_calendar_endpoint() -> list[DividendCalendarItem]:
    try:
        return [DividendCalendarItem(**item) for item in get_dividend_calendar()]
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch dividend calendar.",
        ) from exc


@app.get("/symbols", response_model=SymbolSearchResponse)
def symbols_endpoint(q: str = "", limit: int = 8) -> SymbolSearchResponse:
    try:
        capped_limit = max(1, min(limit, 20))
        results = get_symbol_suggestions(q, limit=capped_limit)
        return SymbolSearchResponse(
            results=[SymbolSuggestion(**item) for item in results],
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch symbol suggestions.",
        ) from exc


@app.post("/analyze_single_stock", response_model=SingleStockAnalyzeResponse)
def analyze_single_stock_endpoint(request: SingleStockRequest) -> SingleStockAnalyzeResponse:
    try:
        result = analyze_single_stock(request.symbol)
        return SingleStockAnalyzeResponse(**result)
    except ValueError as exc:
        message = str(exc)
        if "GEMINI_API_KEY" in message:
            raise HTTPException(status_code=503, detail=message) from exc
        raise HTTPException(status_code=400, detail=message) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to analyze single stock.",
        ) from exc
