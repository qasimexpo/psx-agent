"""
PSX AI FastAPI backend — portfolio analysis (real-time) and DB-backed market reads.
"""

import logging
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from database import DatabaseUnavailableError, init_db
from service import (
    analyze_portfolio,
    analyze_single_stock,
    generate_top_picks,
    get_market_index,
    get_market_ticker,
    get_news_and_events_api,
    get_symbol_suggestions,
    load_api_config,
)

logger = logging.getLogger("smartsarmaya.api")
if not logger.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

app = FastAPI(title="SmartSarmaya API", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_validate_config() -> None:
    """Fail fast on critical env/config errors and ensure DB tables exist."""
    try:
        cfg = load_api_config()
        logger.info(
            "Startup config validated (AI model: %s).",
            cfg.get("model_name", "unknown"),
        )
        init_db()
    except Exception:
        logger.exception("Startup configuration validation failed.")
        raise


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info("Request started: %s %s", request.method, request.url.path)
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Unhandled middleware exception for %s", request.url.path)
        raise
    logger.info(
        "Request completed: %s %s -> %s",
        request.method,
        request.url.path,
        response.status_code,
    )
    return response


@app.exception_handler(DatabaseUnavailableError)
async def database_unavailable_handler(
    request: Request, exc: DatabaseUnavailableError
) -> JSONResponse:
    logger.error("Database unavailable at %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": str(exc)},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled exception at %s: %s",
        request.url.path,
        exc,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "details": "Something went wrong while processing the request.",
        },
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


class NewsAndEventsItem(BaseModel):
    id: int
    type: str
    title_or_symbol: str
    description: str
    link_or_date: str
    last_updated: datetime
    snippet: str | None = None
    source: str | None = None
    region: str | None = None


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
        if "GROQ_API_KEY" in message:
            raise HTTPException(status_code=503, detail=message) from exc
        if "temporarily unavailable" in message.lower():
            raise HTTPException(status_code=503, detail=message) from exc
        logger.warning("analyze_portfolio validation error: %s", message)
        raise HTTPException(status_code=400, detail=message) from exc
    except Exception as exc:
        logger.exception("analyze_portfolio failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate portfolio report.",
        ) from exc


@app.get("/top_picks", response_model=TopPicksResponse)
def top_picks_endpoint(
    category: str | None = Query(default=None, pattern="^(daily|monthly|yearly)$"),
) -> TopPicksResponse:
    try:
        result = generate_top_picks(category)
        return TopPicksResponse(**result)
    except DatabaseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        message = str(exc)
        if "GROQ_API_KEY" in message:
            raise HTTPException(status_code=503, detail=message) from exc
        logger.warning("top_picks validation error: %s", message)
        raise HTTPException(status_code=400, detail=message) from exc
    except Exception as exc:
        logger.exception("top_picks failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to load top picks report.",
        ) from exc


@app.get("/news_and_events", response_model=list[NewsAndEventsItem])
def news_and_events_endpoint(
    type: str | None = Query(default=None, alias="type"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[NewsAndEventsItem]:
    try:
        items = get_news_and_events_api(limit=limit, event_type=type)
        return [NewsAndEventsItem(**item) for item in items]
    except DatabaseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("news_and_events endpoint failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to load news and events.",
        ) from exc


@app.get("/market_index", response_model=MarketIndexResponse)
def market_index_endpoint() -> MarketIndexResponse:
    try:
        return MarketIndexResponse(**get_market_index())
    except Exception as exc:
        logger.exception("market_index endpoint failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch market index.",
        ) from exc


@app.get("/market_ticker", response_model=list[MarketTickerItem])
def market_ticker_endpoint() -> list[MarketTickerItem]:
    try:
        return [MarketTickerItem(**item) for item in get_market_ticker()]
    except DatabaseUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("market_ticker endpoint failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch market ticker data.",
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
        logger.exception("symbols endpoint failed: %s", exc)
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
        if "GROQ_API_KEY" in message:
            raise HTTPException(status_code=503, detail=message) from exc
        logger.warning("analyze_single_stock validation error: %s", message)
        raise HTTPException(status_code=400, detail=message) from exc
    except Exception as exc:
        logger.exception("analyze_single_stock failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to analyze single stock.",
        ) from exc
