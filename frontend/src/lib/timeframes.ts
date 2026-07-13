export type AnalysisTimeframe = "1d" | "1W" | "1M";

export const TIMEFRAME_OPTIONS = [
  { value: "1d", label: "Daily (Short-term)", chartLabel: "Daily" },
  { value: "1W", label: "Weekly (Swing)", chartLabel: "Weekly" },
  { value: "1M", label: "Monthly (Long-term)", chartLabel: "Monthly" },
] as const;

export function getTimeframeChartLabel(timeframe: AnalysisTimeframe): string {
  const option = TIMEFRAME_OPTIONS.find((item) => item.value === timeframe);
  return option?.chartLabel ?? "Daily";
}
