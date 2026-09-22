# SmartSarmaya: analytics, SEO, social and revenue

Written 5 September 2026, alongside `PROJECT-HISTORY.md`. That document records
how the system works. This one records how it is meant to get traffic and make
money, and what is already wired versus what still needs a human to do it.

---

## 1. What is already in the code

Both analytics and AdSense were built during the 5 September rebuild. Neither
needs adding.

| Thing | Where | State |
| --- | --- | --- |
| Google Analytics 4 | `frontend/src/app/layout.tsx` | Loads `gtag` after interaction. Property `G-835C87WVVW`, overridable with `NEXT_PUBLIC_GA_ID` |
| GA custom events | `frontend/src/lib/analytics.ts` | `portfolio_audit`, `stock_analysis` and their failure variants |
| AdSense script | `frontend/src/app/layout.tsx` | Loads for publisher `ca-pub-7107292781644653` |
| `ads.txt` | `frontend/public/ads.txt` | Served at `/ads.txt`, correct format |
| Ad units | home, `/stock/*`, `/brief/*`, `/picks/*` | `GoogleAd` renders nothing unless the slot ID is real, so an unapproved account leaves no gaps |
| Share cards | `frontend/src/app/og/route.tsx` | `/og?type=stock&symbol=PSO` renders a live card. One stable URL, which is what Instagram needs |
| Social broadcast | `pipeline/social.py` | X, Facebook Page and Instagram. Wired into the brief, picks and scorecard jobs; a no-op until credentials exist |
| Pipeline monitor | `pipeline/jobs/monitor.py` | Daily freshness check, alerts Telegram and fails the Actions run |
| Share cards | `frontend/src/app/og/route.tsx` | `/og?type=stock&symbol=PSO` renders a live card. One stable URL, which is what Instagram needs |
| Social broadcast | `pipeline/social.py` | X, Facebook Page and Instagram. Wired into the brief, picks and scorecard jobs; a no-op until credentials exist |
| Pipeline monitor | `pipeline/jobs/monitor.py` | Daily freshness check, alerts Telegram and fails the Actions run |

The publisher ID now falls back to the real account when
`NEXT_PUBLIC_ADSENSE_CLIENT` is unset. Before that change a missing Vercel
variable meant the AdSense script never loaded at all — invisible locally, and
exactly the kind of thing that makes a review fail.

### Verify in production, in this order

1. `curl -s https://www.smartsarmaya.com/ | grep -c adsbygoogle` returns a
   non-zero count. If it is zero the script is not loading and nothing else
   matters.
2. `https://www.smartsarmaya.com/ads.txt` returns the `pub-7107292781644653`
   line.
3. GA4 **Realtime** shows your own visit.
4. Vercel has `NEXT_PUBLIC_ADSENSE_SLOT_TOP`, `..._BOTTOM` and optionally
   `..._ARTICLE`. Without slot IDs the ad units render as nothing.
5. Search Console: submit `https://www.smartsarmaya.com/sitemap.xml` and check
   the indexed count weekly. That number predicts revenue better than any other.

---

## 2. AdSense, realistically

The account has been on "Getting ready" since August. Do not resubmit
repeatedly. The two likely causes — a thin client-rendered page and duplicate
legal pages — were fixed on 5 September, so the current site is the first
version actually worth reviewing.

**What approval needs:** real pages with real content, working navigation, a
privacy policy that names Google and cookies, and traffic that looks human. The
site now has roughly 350 indexable pages. That is enough.

**What it will pay.** Pakistani traffic is priced low. Expect a page RPM of
roughly **$0.30 to $1.50**, with finance content at the top of that range.

| Monthly pageviews | Rough monthly AdSense |
| --- | --- |
| 10,000 | $5 – $15 |
| 50,000 | $25 – $75 |
| 100,000 | $50 – $150 |
| 500,000 | $250 – $750 |

The payout threshold is $100, paid by wire to a Pakistani bank account. At
10,000 views a month that is a payment roughly twice a year, so **AdSense is
not the business until traffic reaches six figures.** Treat it as the thing
that pays for the domain, and read section 6 for what actually pays.

---

## 3. SEO: what to do next, in order of value

The foundations are already done — server rendering, per-page titles and
descriptions, canonicals, a database-driven sitemap, Organization/WebSite/FAQ
schema, and now BreadcrumbList on the stock, brief and sector pages.

What is left, highest value first:

1. **Search Console coverage.** Nothing else matters if pages are not indexed.
   Submit the sitemap, then watch "Crawled – currently not indexed". Thin stock
   pages land there. The fix is more unique text per page, which is what the
   `stocks` job already writes.
2. ~~**Per-page social images.**~~ Done. `/og` renders a card per stock, brief
   and sector, and every page's `openGraph` and `twitter` metadata points at
   it. The same URL is what the pipeline hands Instagram.
3. ~~**Internal links between stock pages.**~~ Done. Each `/stock/XYZ` now
   lists its six most liquid sector neighbours and links to that sector's
   picks page.
4. ~~**A `/picks` hub page.**~~ Done. `/picks` lists all ten sectors with each
   one's current top three, carries `ItemList` and `BreadcrumbList` schema, and
   is what the navbar and footer now link to instead of the `/#picks` anchor.
5. **Widen the indexable set.** `listIndexableSymbols` returns only KSE-100 or
   KMI members, roughly 300 of 496 listed symbols. The rest still get searched
   ("is XYZ halal"). Add them once each page has enough unique text not to look
   thin.
6. **Comparison pages.** `/compare/OGDC-vs-PPL` is a page type sarmaaya.pk does
   not have, generated from data already in the database, and it matches how
   people actually search. **Still to build.**
7. ~~**Answer the question in the first sentence.**~~ Done. Every stock page now
   opens with "Yes, PPL is Shariah compliant. It is a constituent of the KMI All
   Shares Islamic Index...", which is the shape Google lifts into a snippet.
8. **Urdu.** Deferred for v1, but it roughly doubles the reachable audience and
   competition for Urdu finance queries is close to nothing.

---

## 4. Monitoring, because this has already cost eight weeks

`PROJECT-HISTORY.md` section 3 records the Render cron dying silently and the
site serving stale July prices for eight weeks. That gap is now closed.

`python -m pipeline.run monitor` runs daily at 13:00 UTC on the existing
workflow. It writes nothing. It reads the newest quote, brief, pick, indicator,
note and event, compares each against the last completed trading session, posts
to Telegram if anything is behind, and exits non-zero so the Actions run turns
red and GitHub emails about it.

Thresholds are measured against the trading calendar rather than in flat hours,
because PSX does not trade at the weekend and a flat "stale after 24 hours"
rule alerts every Saturday until somebody mutes it. A muted monitor is the same
as no monitor, so that logic has its own test.

Worth running by hand once, so you know what a healthy result looks like before
it ever alerts.

---

## 5. Social: launch plan

### Which channels, and what each is worth

**All four automated channels are now written.** Every one is a logged no-op
until its credentials exist, so the work left is creating the accounts and
pasting secrets into GitHub.

| Channel | Code | What you still have to do |
| --- | --- | --- |
| **Telegram** | `pipeline/notify.py` | Bot via BotFather, public channel, bot as admin. Two secrets |
| **X / Twitter** | `pipeline/social.py` | Developer project with **write** access, OAuth 1.0a tokens. Four secrets. The free tier allows 500 posts a month; this schedule uses about 90 |
| **Facebook Page** | `pipeline/social.py` | Meta app, Page, long-lived Page token. Two secrets |
| **Instagram** | `pipeline/social.py` | Business account linked to the Page. Reuses the Page token, so one extra secret |
| **LinkedIn** | Not written | Awkward API, slow approval. Post by hand, and only if it converts |

### Do this first, today, by hand

1. Register the same handle everywhere before somebody else does:
   **@smartsarmaya** on X, Instagram, Facebook, Telegram, YouTube.
2. Profile image `frontend/public/images/logo-transparent.png`, cover
   `banner 1.jpg`. The same on every platform, so the brand is recognisable.
3. Bio, identical everywhere:
   > Free AI research for the Pakistan Stock Exchange. Shariah-compliant picks screened
   > against the KMI All Shares Islamic Index — the exchange's own list, not a
   > chatbot's guess. Every pick tracked publicly. Not financial advice.
4. Link to `https://www.smartsarmaya.com`.
5. Instagram must be a **Business** account, converted in settings and linked
   to the Facebook Page, or the API cannot post at all.
6. Set `NEXT_PUBLIC_SOCIAL_X`, `..._FACEBOOK`, `..._INSTAGRAM`, `..._LINKEDIN`
   and `..._TELEGRAM` in Vercel. The footer links and the `sameAs` list in the
   Organization schema appear automatically for whichever are set. That is how
   Google connects the profiles to the brand.

### Then paste the secrets in

These are **GitHub repository secrets** (Settings, Secrets and variables,
Actions), not Vercel variables: the pipeline posts, not the site. `.env.example`
lists every name. Add them in this order and each channel switches itself on at
the next scheduled job:

1. `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` - create the bot with BotFather,
   make a public channel, add the bot as an administrator.
2. `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` -
   the project must have **write** access, or posting returns 403.
3. `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN` - a long-lived Page token, not a
   user token.
4. `INSTAGRAM_USER_ID` - reuses the Facebook Page token above.

To test one without waiting for a cron: Actions, Run workflow, pick `brief`.
The log names every channel it posted to or skipped, and says why.

### The posting rhythm

Two or three automated posts a day is enough. More reads as spam and burns the
X quota.

This is what the code already does, with no further configuration:

| When (PKT) | Post | Source job |
| --- | --- | --- |
| 08:45 weekdays | Morning brief headline and KSE-100 level | `brief --session morning` |
| 09:15 weekdays | The day's top Shariah-compliant picks across sectors | `picks` |
| 16:15 weekdays | Closing scoreboard: index close, three gainers, three losers | `brief --session closing` |
| Friday 17:30 | Track record: every open pick marked to market | `scorecard` |

Three posts a day, four on a Friday, which is comfortably inside the X free
tier.

The Friday post is the important one. It shows the top four **and the bottom
two**, deliberately, so it cannot be read as a highlight reel. Publishing the
losers is the whole differentiator, and it is the post people screenshot.

### Post templates

Per-stock result, the format asked for:

```
PSO closed at 178.45, up 2.3% today.

Shariah: compliant (KMI All Shares)
RSI 58 — neutral
52-week range: 141.20 – 214.80
Sector: Oil & Gas Marketing

Full technicals and the AI read:
smartsarmaya.com/stock/PSO

Not financial advice.
#PSX #KSE100 #PakistanStockExchange #ShariahCompliant
```

Daily closing scoreboard:

```
KSE-100 closed at 84,210 (+0.62%)

Gainers   PPL +3.1% | PSO +2.3% | LUCK +1.9%
Losers    ENGRO -2.4% | HBL -1.8% | MCB -1.1%

Today's brief: smartsarmaya.com/brief/2026-09-05
```

Track record, weekly:

```
Our Shariah-compliant picks from 30 days ago, marked to market. All of them.

OGDC  +8.2%
MEBL  +4.1%
LUCK  -2.7%
FFC   -5.3%

Average +1.1%. We publish the losers too:
smartsarmaya.com/track-record
```

Keep the disclaimer on every post that names a symbol. It is what keeps this
educational content rather than unlicensed investment advice, which SECP takes
seriously.

### Rules that keep the accounts alive

- Never say buy, sell, target price, or guaranteed. Say "the data shows".
- Never promise returns.
- Post the losers. An account that only posts winners reads as a scam account,
  and in this market most of them are.
- Answer replies by hand. Automated posting plus human replies is the
  combination that grows.

---

## 6. How this actually makes money

In the order the money arrives, not the order of size.

**1. AdSense — now, small.** Section 2. Turns on with approval and pays for the
domain. Do not build the business around it.

**2. Broker referrals — the realistic first real income.** Every visitor who
runs a portfolio audit either has a brokerage account or wants one. Pakistani
brokers (AKD, Topline, JS Global) pay for funded account referrals. A single
"open an account" placement on `/stock/*` and on the audit result converts far
better than a banner, and the audience is exactly the one brokers pay for.
Approach them once GA can show a traffic number worth quoting.

**3. Sponsored placement.** Asset management companies sell Shariah-compliant
mutual funds and have marketing budgets. One clearly labelled sponsor slot on
the picks page is worth more than a month of AdSense at this traffic level.
Wait until roughly 20,000 monthly sessions before quoting a price.

**4. Ezoic, replacing AdSense.** No traffic minimum, typically 50 to 100 per
cent better RPM than raw AdSense because it auctions the inventory. Move once
AdSense is approved and stable. Mediavine needs 50,000 sessions and Raptive
100,000, so both are later.

**5. A paid tier — the one with real margin.** Everything today is free and
must stay free, because free is what generates the traffic. The paid layer sits
above it: price alerts, portfolio tracking that persists, broker-statement PDF
import, Urdu, and picks earlier than the public. PKR 500 a month from 200
subscribers is PKR 100,000 a month — more than AdSense at any traffic level
this site will reach within a year. It needs accounts, which needs a privacy
rethink, which is why it is not in v1.

**6. Licensing the data.** The pipeline already computes clean indicators for
every listed symbol over a KMI-screened universe. Smaller brokerages and
fintechs buy that. Highest margin, furthest away.

### The order to actually work in

Everything that was code is written. What is left is accounts, secrets and
patience.

1. Deploy, then run the five checks in section 1 against production.
2. Register the five handles. Set the `NEXT_PUBLIC_SOCIAL_*` variables in
   Vercel so the footer links and the `sameAs` schema pick them up.
3. Paste the broadcast secrets into GitHub, Telegram first.
4. Submit the sitemap in Search Console, then check indexed pages weekly.
5. Run `python -m pipeline.run monitor` by hand once.
6. Reply to people by hand. Automated posting plus human replies is what grows
   an account; automated posting alone is a billboard.
7. Approach brokers when GA shows a number worth quoting.

Still unbuilt, in order of value: comparison pages, a wider indexable set, and
Urdu. All three are in section 3.
