# SmartSarmaya

Free AI stock research for the Pakistan Stock Exchange, with Shariah screening that comes from the
exchange itself rather than from a language model.

Live at [smartsarmaya.com](https://www.smartsarmaya.com).

## What makes it different

Every "Shariah-compliant stock picks" tool asks a model which stocks are Shariah compliant. That is guesswork,
and it gets things wrong. SmartSarmaya filters candidates against the **KMI All Shares Islamic
Index** published by the Pakistan Stock Exchange before the model sees them. The model can only
rank and explain what it is given, and any ticker it invents is discarded.

Picks are also recorded with the price at the moment they were published and marked to market every
day, so [the track record](https://www.smartsarmaya.com/track-record) is public, losers included.

## Architecture

Nothing is on a paid tier.

```
GitHub Actions (cron)          Neon Postgres            Vercel
  python -m pipeline.run  ──▶   stocks, picks,   ◀──  Next.js server
  market / events / picks       briefs, events         components read
  brief / technicals            news, tracking         the database directly
                                                            │
                                                    Route handlers call
                                                    Groq for the two
                                                    interactive tools
```

The Python code never runs on a page request. A page view is one indexed SELECT, so there is no
cold start and no API server to keep awake.

### Data sources

All market data comes from the PSX Data Portal (`dps.psx.com.pk`), using the endpoints its own
front end calls:

| Endpoint | Gives us |
| --- | --- |
| `GET /market-watch` | 496 symbols in one request: OHLC, volume, sector, and index membership including KMIALLSHR |
| `GET /performers` | Top gainers, losers, most active |
| `GET /symbols` | Company names, sectors, ETF and debt flags |
| `GET /timeseries/eod/{symbol}` | Five years of closes, used to compute the indicators |
| `GET /timeseries/int/KSE100` | Intraday index level for the sparkline |
| `POST /calendar` | AGM, EOGM and board meetings |
| `POST /payouts` | Dividend announcements with book closure dates |
| `GET /sector-summary/sectorwise` | Advance, decline and turnover per sector |

Two traps worth knowing. The portal sits behind DOSarrest, so a POST with a missing body returns
**HTTP 469** rather than a normal error, and `/payouts` must always receive a `year`. The payouts
and announcements pages render their tables in the browser, so scraping the plain HTML returns
nothing, which is why the form endpoints above are used instead.

Technical indicators (RSI 14, SMA 20/50/200, support, resistance, 52-week range, volatility) are
computed in `pipeline/indicators.py` from exchange closing prices. Support and resistance are swing
levels from closes, not intraday pivots, and the site says so.

## Repository layout

```
pipeline/            Python. Runs only in GitHub Actions.
  psx.py             PSX Data Portal client
  indicators.py      Technical indicators from end-of-day closes
  db.py              Neon schema and writes
  llm.py             Groq with Gemini fallback
  news.py            Google News RSS
  prompts.py         System prompts
  jobs/              market, events, picks, brief, stocks
  run.py             CLI entry point for every job
tests/               Guard tests for the pick pipeline
frontend/            Next.js 16 App Router, deployed to Vercel
  src/lib/db.ts      Read-only Neon queries used by server components
  src/app/api/       Route handlers for the two interactive tools
.github/workflows/   Schedules and CI
```

## Running it

### 1. Database

Create a free project at [neon.tech](https://neon.tech) and copy the pooled connection string.

### 2. Pipeline

```bash
python -m venv .venv
.venv/Scripts/activate        # macOS or Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # then fill in DATABASE_URL and GROQ_API_KEY

python -m pipeline.run bootstrap
```

`bootstrap` fills an empty database in dependency order. After that the individual jobs are:

| Command | What it does | Schedule |
| --- | --- | --- |
| `market` | Quotes, movers, sector breadth, index. Four HTTP requests. | Every 30 min, market hours |
| `technicals` | End-of-day history and indicators | Daily, 17:00 PKT |
| `events` | Dividends, meetings, news | Daily, 08:00 PKT |
| `picks` | Top Shariah-compliant picks for ten sectors | Trading days, 09:15 PKT |
| `brief --session morning\|closing` | AI market brief | 08:45 and 16:15 PKT |
| `scorecard` | Marks open picks to market | Daily, 17:30 PKT |
| `stocks` | AI notes for stock pages | Weekly |
| `monitor` | Alerts and fails if any content has gone stale | Daily, 18:00 PKT |
| `health` | Row counts, writes nothing | On demand |

The `technicals` job has a time budget and processes the stalest symbols first, so it always
finishes inside the workflow timeout and successive runs cover the whole universe.

`monitor` is the one job that writes nothing and is allowed to fail. It compares the newest
quote, brief, pick, indicator, note and event against the last completed trading session,
alerts Telegram, and exits non-zero so the Actions run turns red. It exists because a dead
cron once served stale prices for eight weeks without anyone noticing.

The `brief`, `picks` and `scorecard` jobs also broadcast to Telegram, X, a Facebook Page and
Instagram. Each channel is skipped with a log line when its credentials are absent, so none of
this needs configuring to run the pipeline. See `GROWTH.md` for what to set up and when.

### 3. Site

```bash
cd frontend
npm install
cp ../.env .env.local          # needs DATABASE_URL and GROQ_API_KEY
npm run dev
```

Without `DATABASE_URL` the site still builds and shows a setup notice, which is what keeps CI green.

## Deploying

### Vercel

Import the repository, set the root directory to `frontend`, and add these environment variables:

`DATABASE_URL`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GA_ID`,
`NEXT_PUBLIC_ADSENSE_CLIENT`, and the two AdSense slot IDs.

### GitHub Actions

Add repository secrets `DATABASE_URL`, `GROQ_API_KEY` and `GEMINI_API_KEY`, then enable Actions.
`.github/workflows/pipeline.yml` runs every job on its schedule and can be triggered by hand from
the Actions tab.

Two things to watch:

- Scheduled workflows are **disabled after 60 days without repository activity**. If the data goes
  stale, check that first.
- On a private repository the free allowance is 2,000 minutes a month. The current schedule uses
  roughly 1,100. Making the repository public removes the limit entirely.

## Tests

```bash
pytest tests/ -q          # pick guards
cd frontend && npm run lint && npm run build
```

The Python tests cover the three defects that made earlier picks untrustworthy: a non-compliant
stock being recommended, an invented ticker being accepted, and the model supplying its own price.
They run against SQLite, so no database credentials are needed.

## Licence and disclaimer

SmartSarmaya is an educational research tool. Nothing it produces is financial advice, and nothing
it produces is a religious ruling. Shariah status reflects membership of the KMI All Shares Islamic
Index and nothing more. Market data may be delayed.
