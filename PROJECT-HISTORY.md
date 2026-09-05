# SmartSarmaya: project history and reference

Written 5 September 2026, the day the rebuilt site went live on Vercel.

This is the document to hand to a future developer, or to a future AI assistant,
so nobody has to rediscover what took a long time to work out the first time.
It records what the project is, why it is built the way it is, and the specific
traps that cost real debugging time.

---

## 1. What SmartSarmaya is

A free, ad-supported research site for retail investors on the Pakistan Stock
Exchange. It does four things:

1. **Audits a portfolio.** You type in what you hold. It returns live prices,
   profit and loss, sector concentration, Shariah compliance and a per-holding
   call. Nothing you enter is stored.
2. **Analyses any listed company** on demand.
3. **Publishes halal stock picks** for ten sectors across three horizons, every
   trading morning, with a public track record.
4. **Writes a market brief** twice each trading day.

Live at [smartsarmaya.com](https://www.smartsarmaya.com). No account, no login,
no fee.

---

## 2. The one thing that makes it different

Every other "halal stock picks" tool asks a language model which stocks are
Shariah compliant. That is guesswork and it is wrong often enough to matter.

**SmartSarmaya filters candidates against the KMI All Shares Islamic Index
published by the Pakistan Stock Exchange before the model ever sees them.** The
model can only rank and explain what it is handed, and any ticker it invents is
discarded before anything is saved.

The second differentiator is that **picks are recorded with the price at the
moment they were published and marked to market daily**, so
[/track-record](https://www.smartsarmaya.com/track-record) shows the losers too.
Nobody else in this market publishes that.

Protect both of these. They are the whole product.

---

## 3. How it got here

| When | What |
| --- | --- |
| Jun 2026 | Started as a personal portfolio spreadsheet, analysed by hand in Google AI Studio |
| Jul 2026 | Became a Python script emailing a daily report, driven by Cursor prompts |
| Jul 2026 | Grew into a public site: FastAPI backend and Next.js frontend on Render |
| Jul–Aug 2026 | Gemini free tier exhausted, switched to Groq; added Neon and cron jobs |
| 13 Jul 2026 | **Render free tier ended. The cron silently stopped and the site served stale July prices for eight weeks without anyone noticing.** |
| 5 Sep 2026 | Full rebuild: pipeline moved to GitHub Actions, site to Vercel, halal screening moved to the exchange's own index |

The eight weeks of stale data is the most important lesson in this table. There
was no monitoring, so a dead cron looked exactly like a working one.

---

## 4. Architecture, and why

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

**No Python runs on a page request.** A page view is one indexed SELECT from a
server component. This was deliberate:

- Render's free web services slept after 15 minutes, which is what produced the
  "market ticker temporarily unavailable" message on first load.
- The old site fetched every section from the browser after load, so search
  engines and the AdSense reviewer received an almost empty page. Server
  rendering fixed both problems at once.

**Everything is on a free tier.** Vercel Hobby, Neon free, GitHub Actions free,
Groq free, Gemini free. No paid data feed.

---

## 5. Data sources: the PSX Data Portal

All market data comes from `dps.psx.com.pk`, using endpoints its own front end
calls. These are undocumented. They were found by reading
`dps.psx.com.pk/static/script.js`. **This section is the most valuable part of
this document.**

| Endpoint | Returns |
| --- | --- |
| `GET /market-watch` | **The key one.** All 496 symbols in one request: OHLC, volume, sector code, and index membership including KMIALLSHR |
| `GET /performers` | Top gainers, losers, most active |
| `GET /symbols` | JSON directory: symbol, name, sector name, ETF and debt flags |
| `GET /timeseries/eod/{SYM}` | About 1,240 days of `[timestamp, close, volume, open]`. Works for `KSE100` too |
| `GET /timeseries/int/{SYM}` | Intraday ticks. Works for `KSE100`, which is where the sparkline comes from |
| `POST /calendar` `{from,to}` | AGM, EOGM and board meetings as JSON |
| `POST /payouts` `{year}` | Dividend announcements with book closure dates |
| `GET /sector-summary/sectorwise` | Sector codes to names, advance/decline/turnover |

### Traps

- **The portal sits behind DOSarrest.** A POST with a missing or empty body
  returns **HTTP 469**, not a normal 4xx. `/payouts` must always receive a
  `year`. Pace requests about 0.6 seconds apart.
- **`/payouts` and `/announcements` render their tables in the browser.**
  Scraping the plain page HTML finds zero tables. This is why the dividend
  calendar was empty for months. Use the form endpoints above instead.
- **Sector codes are not guessable.** Verified values:

  | Code | Sector | Code | Sector |
  | --- | --- | --- | --- |
  | 0801 | Automobile Assembler | 0821 | Oil & Gas Marketing |
  | 0804 | Cement | 0823 | Pharmaceuticals |
  | 0807 | Commercial Banks | 0824 | Power Generation |
  | 0809 | Fertilizer | 0825 | Refinery |
  | 0810 | Food & Personal Care | 0828 | Technology |
  | 0820 | Oil & Gas Exploration | 0829-31 | Textile |

- **Indicators are computed locally** in `pipeline/indicators.py` from those
  end-of-day closes: RSI 14, SMA 20/50/200, support, resistance, 52-week range,
  volatility. This replaced the unofficial TradingView scraper, which returned
  HTTP 429 under load and silently dropped symbols. Support and resistance are
  swing levels from **closing** prices, not intraday pivots, and the site says
  so rather than pretending otherwise.

---

## 6. AI providers

Groq first, Gemini as fallback. Both free.

### Groq

- **Groq retires models without warning, and a retired name returns 404 rather
  than degrading.** The project previously used `llama-3.1-8b-instant` and
  `llama-3.3-70b-versatile`; by September 2026 this account had **no Llama
  models at all**, which is why generation was failing silently in production.
- Working as of 5 Sep 2026: `openai/gpt-oss-120b` for cron work,
  `openai/gpt-oss-20b` for interactive. Each setting is a **fallback chain**, so
  one retirement costs quality instead of the whole feature.
- **Avoid `qwen/*`.** Its 1000 output-tokens-per-minute cap rejects every
  request this pipeline makes.
- Rate limits on the free tier: 1,000 requests per day, and a token bucket of
  roughly 8,000 that **refills each minute**. A sector pick generation uses
  about 5,600 tokens, which is why sector calls are paced 30 seconds apart and
  the notes job runs against a clock.

If generation stops, check the logs for `model_not_found` and update the model
names from [console.groq.com/docs/models](https://console.groq.com/docs/models).

### Gemini

- **Keys now begin `AQ.`, not `AIza`.** That is the current AI Studio format and
  it works, but only in the `x-goog-api-key` header against the **`v1beta`**
  endpoint.
- `Authorization: Bearer` is rejected with `ACCESS_TOKEN_TYPE_UNSUPPORTED`.
- The `v1` endpoint has no JSON mode: "JSON mode is not enabled for api version
  v1".
- The `google-generativeai` package is deprecated and cannot use these keys at
  all, so the pipeline calls Gemini over plain `requests`.
- Avoid the `gemini-flash-latest` alias; it was returning 503 under load, which
  is the opposite of what a fallback is for.

---

## 7. Bugs worth recognising again

These were all found by running the real system against real services. None of
them were visible to unit tests or to `next build`.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Picks silently stopped generating | Every Groq Llama model returned 404 | Model fallback chains |
| `CompileError: explicitly rendered as a boundparameter` | A batched Postgres INSERT needs uniform columns; a batch mixed a full indicator row with a short one. SQLite hid this by looping per row | Group batches by column signature |
| Every `/brief/<date>` URL and the sitemap broken | Both Postgres drivers return a JavaScript `Date` for a DATE column, and `String(date)` gives `"Sat Sep 05 2026 00:00:00 GMT+0500 (Pakistan Standard Time)"` | Normalise through `toIsoDay`; there is now a test that fails if a raw `String()` returns |
| Dividend calendar always empty | Scraper read pages whose tables render in the browser | Use the portal's own form endpoints |
| Technicals job hung for 30 minutes | One slow symbol, three retries, no overall budget | Time budget plus stalest-first ordering |
| Notes job crawling at 70s per note | Groq token bucket exhausted, job grinding on retries | Time budget; job stops and resumes next run |
| Autocomplete swallowed the next click | Dropdown stayed open over the field below | Close on blur with a short delay |
| Sector chips scrolled with an ugly native scrollbar | `overflow-x: auto` on the chip row | Wrap on desktop, native select on mobile |
| Changing sector jumped to the top of the page | Each sector is its own route | Links target the `#picks` anchor |

---

## 8. What the rebuild removed

Deleted, and preserved in git history:

- `api.py`, `service.py` — FastAPI app, replaced by Next.js route handlers
- `fetchers.py` — TradingView and scraping, replaced by `pipeline/psx.py`
- `ai_agent.py` — prompts, replaced by `pipeline/prompts.py`
- `cron_updater.py` — replaced by `pipeline/run.py`
- `database.py` — replaced by `pipeline/db.py`
- `render.yaml` — Render's free tier ended
- The three root `test_*.py` scripts — replaced by `tests/`
- Roughly 20 frontend components superseded by the redesign
- Duplicate `/privacy` and `/terms` pages, now 308 redirects to the canonical
  ones. Duplicate thin pages are an AdSense problem.

The live database was migrated in place on 5 September 2026: `top_picks` gained
a `pick_date` column so history accumulates, and the superseded `ticker_data`
and `news_and_events` tables were dropped. Everything was exported first to
`psx-agent-backup-psx-2026-09-05/`, which sits beside the repository and is not
tracked by git.

---

## 9. Operating runbook

### Jobs

```bash
python -m pipeline.run health        # row counts, writes nothing. Start here.
python -m pipeline.run market        # quotes, movers, index. Four HTTP requests.
python -m pipeline.run technicals    # end-of-day history and indicators
python -m pipeline.run events        # dividends, meetings, news
python -m pipeline.run picks         # Top Halal Picks, ten sectors
python -m pipeline.run brief --session morning|closing
python -m pipeline.run scorecard     # mark open picks to market
python -m pipeline.run stocks        # AI notes for stock pages
python -m pipeline.run bootstrap     # empty database, everything in order
```

### Schedule, all UTC (Pakistan is UTC+5)

| Time | Job |
| --- | --- |
| 03:00 daily | events |
| 03:45 weekdays | brief, morning edition |
| 04:00–11:00 every 30 min, weekdays | market |
| 04:15 weekdays | picks |
| 11:15 weekdays | brief, closing edition |
| 12:00 weekdays | technicals |
| 12:30 weekdays | scorecard |
| 20:00 daily | stocks |

Market hours only, because PSX trades 09:30–15:30 PKT and refreshing prices at
3am wastes the free Actions allowance.

### Two scheduling facts that will bite

1. **GitHub disables scheduled workflows after 60 days of repository
   inactivity.** If data goes stale, check this first. It is the modern version
   of what happened with Render.
2. On a private repository the free allowance is 2,000 minutes a month and this
   schedule uses roughly 1,100. Making the repository public removes the limit
   entirely, and no secrets live in the repository.

### If the site looks wrong

- **Sections empty but the page loads.** A database read failed. Reads degrade
  to empty rather than erroring. Check Vercel function logs for `[db] query
  failed`.
- **Prices stale.** The pipeline is not running. Check the Actions tab first,
  then the 60-day rule above.
- **Picks missing but everything else fine.** The AI provider failed. Run the
  picks job by hand and read the log.
- **Rolling back the site.** Vercel keeps every deployment. Promote the previous
  one to production; it takes seconds and does not touch the database.

---

## 10. Testing

```bash
pytest tests/ -q                      # 18 tests, no credentials needed
cd frontend && npm run lint && npm run build
```

The Python tests run against SQLite, so they need no database. Three are worth
knowing about:

- **Pick guards** prove a non-compliant stock, an invented ticker and a
  model-supplied price are all rejected. These protect the core product claim.
- **Schema contract** parses the frontend's SQL as PostgreSQL and checks every
  column against the SQLAlchemy models. Nothing else connects the Python writer
  to the TypeScript reader.
- **Date guard** fails if a DATE column is ever stringified directly again.

---

## 11. Where the traffic is meant to come from

Sarmaaya.pk wins on page count, so the pipeline generates pages rather than
competing by hand:

- One page per company, `/stock/OGDC`, targeting "is OGDC halal" and "OGDC share
  price target"
- One page per sector, `/picks/cement`, targeting "halal cement stocks Pakistan"
- One page per brief, `/brief/2026-09-05`, roughly 500 new indexable pages a year

The sitemap is generated from the database, so new pages submit themselves.
Currently 350 URLs.

AdSense had been stuck on "Getting ready" since August. The likely causes were a
thin client-rendered single page and duplicate legal pages, both now fixed. Do
not resubmit repeatedly.

---

## 12. Not built yet

Worth considering, in rough order of value:

- **Monitoring.** Nothing alerts when the pipeline stops. This is the same gap
  that cost eight weeks of stale data. A simple daily check that the newest
  `quote_at` is recent would close it.
- **Telegram broadcast** is written and wired into the brief and picks jobs, but
  needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID` to switch on.
- **Urdu.** Deliberately deferred for version one. Roughly doubles the
  reachable audience.
- Portfolio import from a broker statement PDF, which was done by hand in the
  original AI Studio chat and is genuinely useful.
- Email or push alerts on book closure dates for stocks a visitor cares about,
  which would need accounts and therefore a privacy rethink.

---

## 13. Key files

| Path | Purpose |
| --- | --- |
| `pipeline/psx.py` | PSX Data Portal client. Start here for anything data related. |
| `pipeline/indicators.py` | RSI, moving averages, support and resistance |
| `pipeline/db.py` | Schema and all writes |
| `pipeline/llm.py` | Groq with Gemini fallback |
| `pipeline/prompts.py` | Every system prompt |
| `pipeline/jobs/` | One module per scheduled job |
| `frontend/src/lib/db.ts` | Every read the site makes |
| `frontend/src/app/api/` | The two interactive AI endpoints |
| `DEPLOY.md` | Vercel, Cloudflare DNS, GitHub secrets |
| `README.md` | Architecture and local setup |
