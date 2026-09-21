# Facebook posts — Monday 21 September 2026

Six cards, 1080×1350 (4:5). Post one or two a day rather than all at once; Facebook's reach drops when a Page posts in bursts. Suggested order: 1 today, 2 tomorrow morning, 4 mid-week, 3, then 5 and 6 on quieter days.

Every caption ends with the disclaimer line. Keep it; it is what AdSense and Meta's finance policies look for.

---

## 1 · Market — `01-market-2026-09-21.jpg`

**PSX today: KSE-100 at 171,216, a third straight session of gains.**

This morning's brief had the market opening 1.1% higher with unusually broad participation: Technology & Communication 20 up against 1 down, Power Generation 14 up against 1 down, and every Oil & Gas Marketing name in the green.

Movers: LSEFSL, JATM and BML at the 10% limit; PIM the biggest loser at −9.99%. MDTL was the most active share, up 8.68% on 36.5 million traded.

Corporate actions to note this week: INDU's 470% dividend and BPL's 20% bonus, plus a run of AGMs.

The morning and closing briefs are written from exchange data every trading day → smartsarmaya.com/brief

Educational only, not financial advice.
#PSX #KSE100 #PakistanStockExchange #StockMarketPakistan

---

## 2 · PPL — `02-ppl.jpg`

**PPL: Shariah compliant, in an uptrend, and a Rs 6 dividend on the way.**

Pakistan Petroleum closed at Rs 229.22 (+0.18%). It sits above its 50-day (226.03) and just under its 200-day average (229.57), with RSI at 53 — neither stretched nor washed out. Up 20.5% over a year; down 6.8% over three months.

Our AI note calls it "Watch": the bull case is a successful drilling programme and supportive regulatory reforms lifting the valuation; the bear case is regulatory setbacks and oil-price volatility weighing on it. Both are scenarios, not forecasts.

What's certain: a 60% final dividend (Rs 6 per share) with book closure from 21 October, and the AGM on 27 October. Buy before the ex-date to receive it; the price adjusts by roughly the dividend on the day.

Full page with technicals, peers and the halal status → smartsarmaya.com/stock/PPL

Educational only, not financial advice.
#PPL #PSX #HalalInvesting #Dividends

---

## 3 · OGDC — `03-ogdc.jpg`

**OGDC: compliant, below its 50-day average, dividend closure on 9 October.**

Oil & Gas Development closed at Rs 317.89 (−0.05%). It's trading below its 20- and 50-day averages (322.86 / 320.78) but above the 200-day (306.57), which is why the page labels the trend down while the one-year return is still +18.4%. RSI 46.7. Support 316.30, resistance 320.29.

Our AI note: "Watch". Bull case — upstream activity and commodity prices supporting margins; bear case — regulatory uncertainty and the post-dividend overhang. Scenarios, not predictions.

Certain: 60% final dividend (Rs 6 per share), book closure from 9 October, AGM 16 October.

Everything on one page → smartsarmaya.com/stock/OGDC

Educational only, not financial advice.
#OGDC #PSX #HalalStocks #KSE100

---

## 4 · Is it halal? — `04-is-it-halal.jpg`

**Is it halal? Every company page answers in its first sentence.**

Not from a chatbot's opinion — from the Pakistan Stock Exchange's own Shariah-screened list, the KMI All Shares Islamic Index. If a company is a constituent, it passed the screen. If it isn't, it didn't.

PPL: yes. OGDC: yes. HBL: no.

322 of 546 listed companies currently pass. Search any symbol, free, no account → smartsarmaya.com/stocks

How the screen actually works, and what "compliant" does and doesn't mean → smartsarmaya.com/guides/how-to-check-if-a-psx-stock-is-halal

Index membership is a screen, not a religious ruling. Educational only, not financial advice.
#HalalInvesting #ShariahCompliant #PSX #KMI

---

## 5 · Portfolio audit — `05-portfolio-audit.jpg`

**How much of your portfolio is actually halal? Two minutes to find out.**

Type what you hold — symbol, buy price, quantity — and get back: market value at today's price, profit or loss, the share of your money in Shariah-compliant companies, and your largest sector (flagged when it's over 40%). Plus a card per holding with RSI, support and resistance, trend, upcoming dividends and a short AI note.

No login. Nothing is stored — your holdings are used for that one request and discarded.

Run it → smartsarmaya.com/#audit
Step-by-step guide → smartsarmaya.com/guides/how-to-audit-your-psx-portfolio

Educational only, not financial advice.
#PSX #PortfolioAudit #HalalInvesting #PakistanStockExchange

---

## 6 · Track record — `06-track-record.jpg`

**Every pick we publish is on the record. Including the ones that went wrong.**

256 picks tracked so far; 21.1% currently in profit. Not a flattering number, and it's public anyway, because a record you can only see when it's good isn't a record.

How the picks are made: the exchange's KMI list decides what's halal, the AI only ranks what's already passed, prices come from the database and never from the model, and every pick is marked to market daily.

The scorecard → smartsarmaya.com/track-record
How it works → smartsarmaya.com/guides/how-our-ai-picks-work

A short sample proves very little. Educational only, not financial advice.
#PSX #HalalStocks #Transparency #AIInvesting

---

## Making tomorrow's cards

The generator is `marketing/social/make_cards.py`. It reads the live site, so re-running it after the closing brief produces that day's market card and fresh stock cards:

```
python marketing/social/make_cards.py marketing/social/posts/$(date +%F) PPL OGDC
```

Once `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_TOKEN` are in the GitHub secrets, the pipeline posts every brief and pick to the Page automatically with its own share card; these hand-made cards are for the feature posts and anything you want to say in your own voice.
