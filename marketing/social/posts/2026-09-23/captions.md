# Facebook posts — Wednesday 23 September 2026, morning slot

Five posts. Posted oldest first so the corporate-actions card, the most time-critical, ends up at the top of the Page.

No market card today: the pipeline's scheduled runs did not fire overnight, so there is no morning brief for the 23rd. Yesterday's closing headline next to today's live movers would have read as a contradiction. The closing brief at 16:15 PKT posts today's market data on its own.

---

## 1 · Introduction — `intro-what-it-does.jpg`

**Free Shariah-compliant stock research for the PSX. No account, no course, no signals group.**

If you are new to the Page, this is what the site does:

1️⃣ Is it Shariah compliant? Type any symbol and the company page answers in its first line, from the KMI All Shares Islamic Index — the exchange's own Shariah-screened list, not anyone's opinion. 323 of 547 listed companies currently pass.

2️⃣ Daily market brief. Written from exchange data before the open and after the close: index level, sector breadth, top movers, upcoming dividends and AGMs.

3️⃣ AI picks with a public track record. Ten sectors, marked to market every day. Every pick stays on the scorecard, losers included, so you can check the record before trusting any of it.

4️⃣ Portfolio audit. Enter what you hold and see value, profit or loss, your largest sector, and how much of your money sits in Shariah-compliant companies. No login, nothing stored.

Free → https://www.smartsarmaya.com

Educational only, not financial advice and not a religious ruling.
#PSX #ShariahCompliant #PakistanStockExchange #IslamicFinance

---

## 2 · KSE-100 vs KMI — `guide-psx-indices.jpg`

**The KSE-100 tells you a company is big. It does not tell you it is Shariah compliant.**

Three PSX indices, and people mix them up constantly:

KSE-100 — the 100 largest companies by free-float market value. Chosen by size, not by Shariah status. A KSE-100 stock can fail the screen entirely.

KMI All Shares Islamic Index — every listed company that passes the exchange's Shariah screen, regardless of size. This is the compliant list. Around 320 names.

KMI-30 — the 30 largest and most liquid of those. The benchmark most Islamic funds measure themselves against.

Two mistakes this causes: assuming a big, familiar name must be compliant, and assuming the KMI-30 is the whole compliant universe when it is thirty companies out of roughly 320.

The full explainer, with what each index is actually for → https://www.smartsarmaya.com/guides/kse-100-vs-kmi-30-vs-kmi-all-shares

Index membership is a screen, not a religious ruling. Educational only, not financial advice.
#PSX #KSE100 #KMI #ShariahCompliant

---

## 3 · MARI — `stock-MARI.jpg`

**MARI: Shariah compliant, AGM on Friday, and still below all three of its moving averages.**

Mari Energies is at Rs 657.00, up 1.04% today. That single green day does not change the picture the page shows: the price sits under its 20-day (654.30 — just below), 50-day (657.65) and 200-day (667.09) averages, which is why the trend reads as a strong downtrend. RSI 44.3, so neither stretched nor washed out. Support 641.40, resistance 649.60.

Over a year it is down 5.2%; over three months down 2.0%.

It is a constituent of both the KMI All Shares Islamic Index and the KMI-30, so compliance is decided by the exchange, not by our model. The AGM is on 25 September.

Full page with technicals, peers and corporate actions → https://www.smartsarmaya.com/stock/MARI
What each of these numbers means → https://www.smartsarmaya.com/guides/how-to-read-a-psx-stock-page

A snapshot, not a recommendation. Educational only, not financial advice.
#MARI #PSX #ShariahCompliant #KSE100

---

## 4 · ARPL — `stock-ARPL.jpg`

**ARPL declared a 450% interim dividend. The book closes tomorrow — which means the buying window has already gone.**

This is the part that catches people out, so it is worth being exact. PSX trades settle in two business days. To be on the register when the book closes on 24 September, the shares had to be bought around the 22nd. Buying today does not get you this payout.

What the page shows right now: Rs 448.28, up 0.76%. Unlike most of the market, Archroma is in a strong uptrend — above its 20-day (430.75), 50-day (416.76) and 200-day (409.45) averages, up 12.8% over three months. RSI 63.5, so it is warm but not overbought. Shariah compliant, per the KMI All Shares Islamic Index.

450% on the Rs 10 par value is Rs 45 per share, before withholding tax.

The one to act on if you want a payout this month is the 30 September group — JVDC, JVDCPS and JKSM — where the window is still open for a few more days.

ARPL's page → https://www.smartsarmaya.com/stock/ARPL
Why the price drops on the ex-date, and what XD means → https://www.smartsarmaya.com/guides/psx-ticker-suffixes-xd-xb-xr

Dates are as published by the exchange and can change. Educational only, not financial advice.
#ARPL #PSX #Dividends #ShariahCompliant

---

## 5 · Corporate actions — `events-2026-09-23.jpg`

**What is scheduled on the PSX between now and the start of October.**

Book closures:
ARPL — 450% interim dividend, 24 September (settlement means today is already too late for this one)
JVDC — 60% final dividend, and JVDCPS 12%, 30 September
JKSM — 20% final dividend, 30 September

Shareholder meetings this week:
NML — EOGM today, 11:30
COLG — AGM tomorrow, 15:00
MARI and LUCK — AGMs on Friday

A payout is only yours if you hold the shares before the book-closure date, and because the exchange settles in two days, "before" means two business days earlier than the date itself.

All of it on one page, straight from the PSX data portal → https://www.smartsarmaya.com/#events
How dividends work here → https://www.smartsarmaya.com/guides/dividends-on-the-psx

Dates are as published by the exchange and can change. Educational only, not financial advice.
#PSX #Dividends #PakistanStockExchange #KSE100

---

## Regenerating

```
python marketing/social/make_cards.py marketing/social/posts/$(date +%F) MARI ARPL
```
