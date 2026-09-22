---
title: "How our AI picks work, and why the model is never asked what is Shariah compliant"
description: "Exactly what happens between the exchange's Shariah list and a pick on this site: which decisions a language model makes, which it is not allowed to make, and how every pick is recorded so you can check whether any of it works."
date: 2026-09-18
updated: 2026-09-18
keywords: ["AI stock picks Pakistan", "Shariah-compliant stock picks PSX", "how AI stock picks work", "AI investing transparency", "SmartSarmaya picks"]
image: /images/guides/picks-section.png
imageAlt: "The Shariah-compliant picks section for the cement sector with three ranked pick cards"
related: ["how-to-check-if-a-psx-stock-is-halal", "how-to-read-a-psx-stock-page", "how-to-audit-your-psx-portfolio"]
---

"AI-powered Shariah-compliant stock picks" is a phrase that should make you suspicious. A language model asked whether a company is Shariah compliant will answer confidently and be wrong often enough to matter. A model asked for stock picks with no data in front of it will produce plausible names and invented prices.

This site uses a language model, so the question is fair: what exactly does it do, and what is it stopped from doing? Here is the whole process, in the order it runs every trading morning.

## What the model is not allowed to decide

Two things, and they are the two that matter.

**It does not decide what is Shariah compliant.** Shariah status comes from one source, the KMI All Shares Islamic Index published by the Pakistan Stock Exchange. The [guide to checking compliance](/guides/how-to-check-if-a-psx-stock-is-halal) explains the screen. Before the model sees anything, the candidate list has already been cut to constituents of that index. It is choosing among companies the exchange has screened. It has no way to add one.

**It does not set a price.** Entry prices, buy zones and targets are calculated in code from the database after the model has answered. A number the model writes is never copied to the page.

Everything else is fair game: which of the screened candidates look best, in what order, and why.

## The six steps

<img src="/images/guides/halal-screening-flow.svg" width="1200" height="420" alt="Six steps from the exchange's KMI All Shares list to a recorded, tracked pick" loading="lazy">

*The process for one sector. It runs for ten sectors each trading morning.*

**1. The exchange publishes the list.** The KMI All Shares Islamic Index constituents are loaded from exchange data. This is the only input that touches compliance.

**2. Candidates are cut to constituents.** For each of the [ten sectors](/picks), the companies in that sector's PSX classification are filtered to index members, then ranked by trading volume and capped at a dozen. A conventional bank in the banking sector never reaches the next step; the [Islamic banking page](/picks/islamic-banking) is built from the compliant banks alone.

**3. Real numbers are attached.** Each candidate arrives at the model with its latest price, RSI, moving averages, 52-week position, volume and upcoming events, all computed from exchange closing prices. Recent news headlines for the sector are added. The model is not asked to remember any of this; it is handed it.

**4. The model ranks and explains.** One request per sector produces three lists: short term, roughly one to four weeks; medium term, one to six months; and long term, a year or more. For each pick it writes a one-line summary, a "why now" and a risk. Producing all three horizons in one call is what stops the same three names appearing in every list.

**5. Invented tickers are discarded.** Every symbol in the model's answer is checked against the candidate list it was given. Anything not on it is dropped before saving. Anything on it that is not a current index constituent is dropped too, as a second check. This step exists because models do invent tickers.

**6. Everything is recorded.** Each pick is saved with the date and the price at that moment, then marked to market every trading day on the [track record page](/track-record). Nothing is removed when it goes wrong.

## Reading a pick card

<img src="/images/guides/picks-section.png" width="1200" height="762" alt="The picks section for cement: horizon tabs, a sector selector, and three ranked cards each with a summary, why now, risk, at-pick price, buy zone and target" loading="lazy">

*The cement sector, short-term horizon. The rank, badge and prices are computed; the three sentences are generated.*

- **Rank and Shariah badge.** The order the model chose. The badge repeats what step two already guaranteed.
- **Move since pick.** The percentage change from the price at publication to the latest price, when the pick is a few days old.
- **Summary, why now, risk.** The model's three sentences. This is the generated part of the card.
- **At pick.** The price when the pick was made, from the database.
- **Buy zone.** A band a few percent below the pick price, computed in code.
- **Target.** A level above the pick price scaled to the horizon, computed in code. It is a reference point for the track record, not a forecast.

## How to check whether any of this works

The [track record](/track-record) lists every pick ever published with its entry date, entry price, latest price and return, plus a scorecard: how many are in profit, the average return, how many reached their target. At the time of writing that scorecard is not flattering, and it is on the page anyway, because a record you can only see when it is good is not a record.

A few things to keep in mind when reading it. Returns ignore brokerage, CDC charges and tax. The sample is short. And past picks say nothing about future ones, which is true of every stock-picking service and stated by almost none of them.

## What this is and is not

This is a screening and ranking tool with its reasoning written out. It narrows a list of a few hundred compliant companies to a handful worth looking at in each sector, and tells you why it chose them, so you can disagree.

It is not personal advice. It knows nothing about your income, your goals or your tolerance for a 20 percent drawdown. It is not a religious ruling; it reports index membership. It is not a broker and cannot place a trade. The person responsible for how it is built and what it claims is named on the [about page](/about#editor), which also lists the limitations in full.

If a pick interests you, the next step is its [company page](/stocks), and the [guide to reading one](/guides/how-to-read-a-psx-stock-page).
