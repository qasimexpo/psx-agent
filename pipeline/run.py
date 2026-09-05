"""Command line entry point for every scheduled job.

    python -m pipeline.run market        quotes, movers, sector breadth, index
    python -m pipeline.run technicals    end-of-day history and indicators
    python -m pipeline.run events        dividends, board meetings, news
    python -m pipeline.run picks         Top Halal Picks for every sector
    python -m pipeline.run scorecard     mark open picks to market
    python -m pipeline.run brief --session morning|closing
    python -m pipeline.run stocks        AI notes for stock pages
    python -m pipeline.run health        row counts, no writes
    python -m pipeline.run bootstrap     first run: everything, in order
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime

from pipeline import db
from pipeline.config import PKT, setup_logging

logger = setup_logging("smartsarmaya.run")


def _market(args: argparse.Namespace) -> dict:
    from pipeline.jobs import market

    return market.run()


def _technicals(args: argparse.Namespace) -> dict:
    from pipeline.jobs import market

    return market.run_technicals(limit=args.limit)


def _events(args: argparse.Namespace) -> dict:
    from pipeline.jobs import events

    return events.run()


def _picks(args: argparse.Namespace) -> dict:
    from pipeline.jobs import picks

    sectors = [s.strip() for s in args.sectors.split(",")] if args.sectors else None
    return picks.run(sectors=sectors)


def _scorecard(args: argparse.Namespace) -> dict:
    from pipeline.jobs import picks

    return picks.run_scorecard_only()


def _brief(args: argparse.Namespace) -> dict:
    from pipeline.jobs import brief

    return brief.run(session_name=args.session)


def _stocks(args: argparse.Namespace) -> dict:
    from pipeline.jobs import stocks

    return stocks.run(limit=args.limit or 40)


def _health(args: argparse.Namespace) -> dict:
    db.init_db()
    counts = db.table_counts()
    board = db.scorecard()
    return {"tables": counts, "scorecard": board}


def _bootstrap(args: argparse.Namespace) -> dict:
    """First run on an empty database: fill everything in dependency order."""
    from pipeline.jobs import brief, events, market, picks, stocks

    results: dict[str, object] = {}
    results["market"] = market.run()
    results["technicals"] = market.run_technicals(limit=args.limit)
    results["events"] = events.run()
    try:
        results["picks"] = picks.run()
        results["brief"] = brief.run(session_name="closing")
        results["stocks"] = stocks.run(limit=args.limit or 20)
    except Exception as exc:  # noqa: BLE001 - data layer is still usable without AI
        logger.warning("AI stages skipped or failed during bootstrap: %s", exc)
        results["ai_error"] = str(exc)
    return results


JOBS = {
    "market": _market,
    "technicals": _technicals,
    "events": _events,
    "picks": _picks,
    "scorecard": _scorecard,
    "brief": _brief,
    "stocks": _stocks,
    "health": _health,
    "bootstrap": _bootstrap,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SmartSarmaya data pipeline")
    parser.add_argument("job", choices=sorted(JOBS))
    parser.add_argument(
        "--session",
        default="closing",
        choices=("morning", "closing"),
        help="brief only: which edition to write",
    )
    parser.add_argument(
        "--sectors", default="", help="picks only: comma separated subset of sectors"
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="cap the number of symbols processed"
    )
    args = parser.parse_args(argv)

    started = datetime.now(PKT)
    logger.info("Job '%s' starting at %s PKT.", args.job, started.strftime("%Y-%m-%d %H:%M:%S"))

    try:
        result = JOBS[args.job](args)
    except Exception:
        logger.exception("Job '%s' failed.", args.job)
        return 1

    elapsed = (datetime.now(PKT) - started).total_seconds()
    logger.info("Job '%s' finished in %.1fs: %s", args.job, elapsed, json.dumps(result, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
