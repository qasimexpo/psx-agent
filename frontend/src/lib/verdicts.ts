/**
 * Colours for the AI verdicts, shared by the stock analyser and the
 * portfolio's stock panel so a verdict looks the same wherever it appears.
 * The word is always printed, so colour is never the only signal.
 */
export const VERDICT_STYLE: Record<string, string> = {
  "BUY MORE": "bg-emerald-100 text-emerald-800 border-emerald-200",
  HOLD: "bg-slate-100 text-slate-700 border-slate-200",
  TRIM: "bg-amber-100 text-amber-800 border-amber-200",
  EXIT: "bg-rose-100 text-rose-800 border-rose-200",
  WATCH: "bg-sky-100 text-sky-800 border-sky-200",
};

/** What each verdict means, in a line, for readers new to them. */
export const VERDICT_MEANING: Record<string, string> = {
  "BUY MORE": "The setup supports adding to the position.",
  HOLD: "Nothing in the data calls for a change.",
  TRIM: "Consider taking some profit or reducing the position.",
  EXIT: "The data argues against keeping the position.",
  WATCH: "Wait for a clearer signal before acting.",
};
