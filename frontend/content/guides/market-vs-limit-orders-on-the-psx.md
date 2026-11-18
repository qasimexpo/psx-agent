---
title: "Market orders vs limit orders on the PSX: which to use and when"
description: "What happens when you press buy or sell in a Pakistan Stock Exchange trading app: how market and limit orders are matched, why thinly traded shares can fill at a bad price, how the order book works, and simple rules for placing orders."
date: 2026-11-18
updated: 2026-11-18
keywords: ["limit order PSX", "market order Pakistan", "how to buy shares PSX", "order book PSX", "bid ask spread", "PSX trading app"]
related: ["how-to-read-a-psx-stock-page", "psx-ticker-suffixes-xd-xb-xr", "how-to-read-eps-and-pe-ratio-on-the-psx"]
---

Every PSX trading app asks the same question when you place an order: market or limit? Most new investors pick whichever is selected by default and never think about it again. For large, busy stocks that rarely matters. For smaller ones it can cost you several percent on a single trade. This guide explains the difference and when each one makes sense.

## What happens when you place an order

The exchange runs an **order book** for every symbol. On one side are buy orders (**bids**), each with a price and a quantity. On the other are sell orders (**offers** or **asks**). The highest bid and the lowest ask sit closest together, and the gap between them is the **spread**.

A trade happens when a buyer and a seller agree on a price. Your order type decides how you take part in that.

## Market orders

A market order says: buy (or sell) this many shares now, at whatever price is available.

If you place a market order to buy 500 shares, the exchange fills it against the cheapest offers in the book, working upwards until all 500 are bought. If the cheapest seller only has 200 shares at Rs 50.10 and the next has 300 at Rs 50.40, you get both, at an average of about Rs 50.28.

**The advantage:** speed. Your order fills almost immediately in a liquid stock.

**The risk:** you don't control the price. In a busy stock with thousands of shares on every price level, the difference is a few paisa. In a thinly traded stock, the book can be shallow, and a market order can walk up several price levels, paying far more than the last traded price you saw on screen.

## Limit orders

A limit order says: buy (or sell) this many shares, but only at this price or better.

A limit order to buy 500 shares at Rs 50.10 fills only at Rs 50.10 or lower. If there aren't enough sellers at that price, part of the order fills and the rest waits in the book until someone sells at your price, or until the order expires or you cancel it.

**The advantage:** you never pay more (or sell for less) than you chose.

**The risk:** the order may not fill, or may fill only partly, if the price moves away from you.

## A worked example

You want 1,000 shares of a small company. The last trade was at Rs 20.00. The book looks like this:

| Bids (buyers) | | Asks (sellers) | |
|---|---|---|---|
| Rs 19.80 | 2,000 | Rs 20.05 | 300 |
| Rs 19.75 | 1,500 | Rs 20.40 | 400 |
| Rs 19.60 | 3,000 | Rs 21.00 | 500 |

- **Market order for 1,000:** you buy 300 at 20.05, 400 at 20.40 and 300 at 21.00. Average price: about Rs 20.48, 2.4% above the last trade, before you have done anything wrong.
- **Limit order for 1,000 at Rs 20.10:** you buy 300 at 20.05 straight away. The other 700 wait as a bid at 20.10 until sellers come down to you.

In a large, liquid stock the same order would have filled within a paisa or two either way. That is the whole difference: market orders are fine when the book is deep and dangerous when it is thin.

## When to use which

**Use a limit order when:**

- the stock trades only a few thousand shares a day;
- the spread between the best bid and ask is wide;
- you are buying or selling a quantity that is large compared with what's on offer at the best price;
- the market has just opened, or news has just come out, and prices are jumping;
- you have a specific price in mind and are happy to wait.

**A market order is reasonable when:**

- the stock is one of the most traded on the exchange, with a narrow spread and plenty of shares at each price;
- the quantity is small;
- getting the trade done now matters more than a few paisa.

If you are unsure, use a limit order set at or just above the best ask (for a buy) or at or just below the best bid (for a sell). It fills almost like a market order in a liquid stock, but protects you if the book is thinner than you thought.

## Daily price limits

The PSX applies daily price limits to individual shares, often called circuit breakers. When a share hits its upper or lower limit, it cannot trade beyond it for the rest of the day, and you will often see a long queue of orders stuck at that price. Placing a market order into a locked share does not jump the queue. Orders are matched by price first and then by the time they were entered, so the earliest orders at the limit price are filled first.

## How long orders last

Most brokers on the PSX treat orders as valid for the day unless you choose otherwise, and unfilled limit orders are cancelled at the close. If your order didn't fill, check the next morning and decide whether to place it again at the same price or a new one. Your broker's app shows open, partly filled and cancelled orders separately.

## Checking the book before you trade

Most trading apps show the best bids and asks, the volume traded so far today and the last traded price. Before a trade in an unfamiliar stock, take ten seconds to look at:

- **the spread:** a few paisa is normal in large stocks; a rupee or more on a Rs 20 share is a warning;
- **the depth:** how many shares sit at each price level compared with your order;
- **today's volume:** if your order is bigger than a good part of the day's trading, split it up.

Our [stock page guide](/guides/how-to-read-a-psx-stock-page) explains where to see the price range and volume history for any symbol, which helps you judge how liquid it is before you place an order.

## The short version

A market order trades now at whatever price is available. A limit order trades only at your price or better. For large, busy stocks the difference is tiny. For small or fast-moving ones, use a limit order, check the spread and depth first, and split large orders. It is the cheapest protection available on any trading app.
