/**
 * A mechanical technical summary, in the spirit of TradingView's rating:
 * each indicator votes up, down or neutral and the average places a needle
 * between Strong sell and Strong buy. It summarises what the indicators say;
 * it is not a recommendation, and the page says so.
 */

export type Vote = { label: string; detail: string; vote: -1 | 0 | 1 };

export type TechnicalInputs = {
  current_price: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  rsi_14: number | null;
  change_1m_pct: number | null;
};

export const RATINGS = ["Strong sell", "Sell", "Neutral", "Buy", "Strong buy"] as const;
export type Rating = (typeof RATINGS)[number];

function versusAverage(label: string, price: number | null, average: number | null): Vote | null {
  if (!price || !average) return null;
  const gap = ((price - average) / average) * 100;
  return {
    label,
    detail: `Price ${gap >= 0 ? "above" : "below"} it by ${Math.abs(gap).toFixed(1)}%`,
    vote: gap > 0 ? 1 : gap < 0 ? -1 : 0,
  };
}

export function technicalVotes(stock: TechnicalInputs): Vote[] {
  const votes: (Vote | null)[] = [
    versusAverage("20-day average", stock.current_price, stock.sma_20),
    versusAverage("50-day average", stock.current_price, stock.sma_50),
    versusAverage("200-day average", stock.current_price, stock.sma_200),
  ];
  if (stock.rsi_14 !== null) {
    const rsi = stock.rsi_14;
    votes.push({
      label: "RSI (14)",
      detail: `${rsi.toFixed(0)}: ${rsi < 30 ? "oversold" : rsi > 70 ? "overbought" : "in the normal range"}`,
      vote: rsi < 30 ? 1 : rsi > 70 ? -1 : 0,
    });
  }
  if (stock.change_1m_pct !== null) {
    const move = stock.change_1m_pct;
    votes.push({
      label: "1-month momentum",
      detail: `${move >= 0 ? "+" : ""}${move.toFixed(1)}% over the month`,
      vote: move > 2 ? 1 : move < -2 ? -1 : 0,
    });
  }
  return votes.filter((v): v is Vote => v !== null);
}

/** The average vote, from -1 to 1, and the rating band it falls in. */
export function summarise(votes: Vote[]): { score: number; rating: Rating } | null {
  if (votes.length < 3) return null;
  const score = votes.reduce((sum, v) => sum + v.vote, 0) / votes.length;
  const rating: Rating =
    score <= -0.5 ? "Strong sell" : score < -0.1 ? "Sell" : score <= 0.1 ? "Neutral" : score < 0.5 ? "Buy" : "Strong buy";
  return { score, rating };
}
