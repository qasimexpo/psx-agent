# I built an AI stock picker that is not allowed to pick stocks. Here is what it is allowed to do.

**Target:** LinkedIn article (primary), Medium (secondary, with `canonical` set to the LinkedIn URL or to smartsarmaya.com/guides/how-our-ai-picks-work). Also fits dev.to under #ai #fintech.
**Byline:** Qasim Riaz. **Length:** ~1,000 words. **Tone:** builder to builders; the site is the worked example, not the pitch.
**Status:** draft, distinct from the on-site guide of the same subject.

---

Every week someone launches "AI stock picks" for some market. I launched one for the Pakistan Stock Exchange this month, and the most useful thing I can tell other builders is the list of things I decided the model must never be allowed to do. The product got better each time the list got longer.

Some context. The PSX has about five hundred listed companies. A large share of retail investors want holdings that are Shariah compliant, and the exchange publishes a screened list, the KMI All Shares Islamic Index, that defines exactly which companies qualify. A "Shariah-compliant AI stock picker" is therefore two problems in one: a compliance problem with a known correct answer, and a ranking problem with no correct answer at all. Treating them as one problem is how you build something harmful.

## Rule 1: the model never decides compliance

The first prototype asked the model, in a system prompt, to "only recommend Shariah-compliant companies". It complied enthusiastically and included a conventional bank in its first output. Language models know a lot about Islamic finance in general and nothing reliable about which specific Pakistani company borrowed too much last year.

The fix is structural, not prompt-based. The candidate list is filtered to index constituents in code before the model sees a single name. The model chooses among companies that have already passed. It has no path by which to add one. If the exchange's list changes at the next review, the candidates change with it, and no prompt needs editing.

This sounds obvious written down. It was not obvious at 1 a.m. with a prompt that mostly worked.

## Rule 2: the model never produces a number that reaches the page

Ask a model for a stock pick and it will volunteer a price, a target and a stop. They look right. They are frequently a few weeks stale, or invented, or the price of a different company with a similar name.

Every number on a pick card is computed after the model answers: the entry price is read from the database at that moment; the buy zone is a fixed percentage below it; the target is a percentage above it scaled to the horizon. The model writes three sentences per pick, a summary, a "why now" and a risk, and nothing else it says is stored.

The corollary: the model gets real numbers as input. Each candidate arrives with its latest price, RSI, moving averages, 52-week position and upcoming corporate actions, all computed from exchange closing prices. It is not asked to recall any of that from training data. Retrieval, not recollection.

## Rule 3: anything the model invents is thrown away, twice

Even with a supplied list, models occasionally return a ticker that was not on it: a plausible-looking symbol, or a real company from the wrong sector. Every symbol in the response is checked against the candidate list it was given, and dropped if absent. Then, separately, it is checked against the current index constituents, and dropped if absent. The second check is redundant on a good day. It exists for the bad day.

The test suite has a case that feeds the model's role a hallucinated symbol and a real non-compliant one and asserts both are discarded. That test has caught two regressions.

## Rule 4: one call per sector, all horizons at once

The obvious design is one model call per sector per horizon. It produced the same three large-cap names for short, medium and long term, every time, because for any single question the most liquid names are the safest answer. Asking for all three horizons in one call, with the instruction that they should differ in character, fixed it: short-term lists became swing setups, long-term lists became dividend compounders. Cheaper, too.

## Rule 5: record everything, publish the losers

A pick that is not recorded is an opinion. Every pick is saved with its date and price, marked to market daily, and shown on a public track record page with a scorecard: how many are in profit, average return, how many hit their target. Nothing is deleted when it goes wrong.

At the time of writing the scorecard is not flattering, and it is on the page anyway. A record you can only see when it is good is not a record. It is also, I have found, the single thing that makes people trust the rest of the site: the willingness to show the number.

## Rule 6: say who is responsible

The briefs and picks are generated and published automatically. The page says so, in words, next to the name of the person answerable for how the system is built and what it claims. Not "reviewed by", because no human reads each brief before it goes out and claiming otherwise would be a lie. "Editor", in the sense of the person who set the rules and takes the complaints.

For anything touching money, I think this is going to matter more every year. Readers, regulators and search engines all want to know who stands behind a page, and "the AI" is not an answer.

## What the model is actually for

After all those rules, what is left is still worth having. The model reads a dozen candidates with their numbers and recent news, orders them, and explains the order in language a retail investor can follow and argue with. That is a job humans do slowly and expensively, and it does it in seconds, per sector, every morning. Constrained correctly, it is a good analyst's junior: fast, well-read, never allowed to sign anything.

The site is smartsarmaya.com if you want to see the result, including the track record. The methodology page describes every step above in more detail. If you are building something similar for another market, the list of rules is the part worth stealing.

---

*Qasim Riaz builds SmartSarmaya, a free research site for the Pakistan Stock Exchange. Nothing here is investment advice.*
