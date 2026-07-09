"use client";

import { useCallback, useState } from "react";
import AnalysisProgressModal from "@/components/AnalysisProgressModal";
import Hero from "@/components/Hero";
import MarketIndexBar from "@/components/MarketIndexBar";
import NewsSection from "@/components/NewsSection";
import PortfolioForm from "@/components/PortfolioForm";
import ReportView from "@/components/ReportView";
import TopPicks from "@/components/TopPicks";
import type { AnalyzeResult } from "@/lib/api";

export default function HomePage() {
  const [report, setReport] = useState<AnalyzeResult | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [analyzeSymbols, setAnalyzeSymbols] = useState<string[]>([]);
  const [pendingReport, setPendingReport] = useState<AnalyzeResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [apiDone, setApiDone] = useState(false);

  const handleLoadingChange = useCallback((isLoading: boolean, symbols?: string[]) => {
    if (isLoading) {
      setShowProgress(true);
      setAnalyzeSymbols(symbols ?? []);
      setPendingReport(null);
      setAnalysisError(null);
      setApiDone(false);
      setReport(null);
    }
  }, []);

  const handleReport = useCallback((result: AnalyzeResult | null) => {
    if (result) {
      setPendingReport(result);
      setAnalysisError(null);
      setApiDone(true);
    }
  }, []);

  const handleAnalysisError = useCallback((message: string) => {
    setAnalysisError(message);
    setPendingReport(null);
    setApiDone(true);
  }, []);

  const handleProgressComplete = useCallback(() => {
    setShowProgress(false);
    setApiDone(false);

    if (pendingReport) {
      setReport(pendingReport);
      setPendingReport(null);
      setAnalysisError(null);
      requestAnimationFrame(() => {
        document.getElementById("report")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
      return;
    }

    setAnalysisError(null);
  }, [pendingReport]);

  return (
    <>
      <Hero />
      <MarketIndexBar />
      <PortfolioForm
        onReport={handleReport}
        onLoadingChange={handleLoadingChange}
        onError={handleAnalysisError}
      />
      {report && !showProgress && <ReportView data={report} loading={false} />}
      <TopPicks />
      <NewsSection />

      <AnalysisProgressModal
        open={showProgress}
        symbols={analyzeSymbols}
        apiDone={apiDone}
        error={analysisError}
        onComplete={handleProgressComplete}
      />
    </>
  );
}
