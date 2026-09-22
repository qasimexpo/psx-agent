# Facebook posts — Tuesday 22 September 2026, market set

Five posts built from today's live data. Posted oldest first so the corporate-actions card, the most time-critical, sits at the top of the Page.

---

## 1 · Track record — `feature-track-record.jpg`

**Every pick we publish stays on the record. Including the ones that went wrong.**

338 picks tracked so far. 26.6% are currently in profit.

That is not a flattering number, and it is public anyway, because a record you can only see when it looks good is not a record.

How the picks are made, in this order: the exchange's KMI All Shares list decides what is Shariah compliant, the AI only ranks companies that already passed, prices come from the database and never from the model, and every pick is marked to market each trading day.

The scorecard → https://www.smartsarmaya.com/track-record
How it works → https://www.smartsarmaya.com/guides/how-our-ai-picks-work

A short sample proves very little. Educational only, not financial advice.
#PSX #ShariahCompliant #Transparency #PakistanStockExchange

---

## 2 · Dividend calculator — `feature-dividend-PPL.jpg`

**PPL declared a 60% final dividend. That is not 60% of the share price.**

PSX dividends are quoted on the Rs 10 par value, so 60% means Rs 6 per share.

400 shares × Rs 6 = Rs 2,400 gross
Withholding tax at 15% for filers = − Rs 360
Paid into your account = Rs 2,040
Yield at Rs 228 = 2.6%

Non-filers pay 30% withholding on the same dividend, so being on the ATL is worth sorting out before dividend season.

Run your own numbers, free → https://www.smartsarmaya.com/calculators
PPL's dividend and book-closure dates → https://www.smartsarmaya.com/stock/PPL
How dividends work on the PSX → https://www.smartsarmaya.com/guides/dividends-on-the-psx

You must hold the shares before the book-closure date to receive the dividend. Educational only, not tax advice.
#PSX #Dividends #PPL #PakistanStockExchange

---

## 3 · LUCK — `stock-LUCK.jpg`

**LUCK: Shariah compliant, AGM on Friday, and trading below all three of its moving averages.**

Lucky Cement is at Rs 408.92, down 1.20% today. The page calls the trend a strong downtrend, and the numbers show why: the price sits under its 20-day (424.54), 50-day (437.86) and 200-day (442.56) averages. RSI 46.7, so it is neither stretched nor washed out. Support 416.68, resistance 428.07.

Over a year it is down 11.7%; over the last week it is up 3.8%.

It is a constituent of the KMI All Shares Islamic Index, so compliance is decided by the exchange, not by our model. The AGM is on 25 September.

Full page with technicals, peers and corporate actions → https://www.smartsarmaya.com/stock/LUCK
What each of those numbers means → https://www.smartsarmaya.com/guides/how-to-read-a-psx-stock-page

This is a snapshot, not a recommendation. Educational only, not financial advice.
#LUCK #PSX #Cement #ShariahCompliant

---

## 4 · Market — `01-market-2026-09-22.jpg`

**PSX today: KSE-100 at 171,215, barely changed on the session.**

This morning's brief had the index opening at 171,153, up 0.16%, with Shariah-compliant names leading: TISL, FNEL and MDTL at the top, FECM and OML the main drags.

TISL was the most active share of the session — up 22.85% to Rs 5.00 on about 119 million shares. Worth being clear about what that means: a 22% move on a Rs 5 share is a small amount of money moving a lot, and volume is not the same as value. Investment banks and investment companies posted 18 advances against 12 declines, while refiners and transport were fully in the green.

The morning and closing briefs are written from exchange data every trading day → https://www.smartsarmaya.com/brief

Educational only, not financial advice.
#PSX #KSE100 #PakistanStockExchange #StockMarketPakistan

---

## 5 · Corporate actions — `events-2026-09-22.jpg`

**Four book closures on the PSX before the end of the month. Two of them are today.**

INDU's 470% final dividend and BPL's 20% bonus close their books today, 22 September. If you are not already a shareholder, those two are settled — the PSX settles trades in two days, so you needed the shares by last week, not today. This is the part people get wrong most often.

Still ahead:
ARPL — 450% interim dividend, book closure 24 September
JVDC — 60% final dividend, and JVDCPS 12%, book closure 30 September
JKSM — 20% final dividend, book closure 30 September

Shareholder meetings: ACPL, FATIMA and LOTCHEM today, NML tomorrow, COLG on the 24th, then MARI, LUCK, AHL and SEPL on the 25th.

All of it on one page, from the PSX data portal → https://www.smartsarmaya.com/#events
Why the price drops on the ex-date, and what XD means → https://www.smartsarmaya.com/guides/psx-ticker-suffixes-xd-xb-xr

Dates are as published by the exchange and can change. Educational only, not financial advice.
#PSX #Dividends #PakistanStockExchange #KSE100

---

## Regenerating

```
python marketing/social/make_cards.py marketing/social/posts/$(date +%F) LUCK PPL
```

produces the market, company, events, intro, dividend and feature cards from the live site in one run.
