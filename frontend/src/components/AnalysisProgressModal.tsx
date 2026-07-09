"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";

const STEPS = [
  {
    title: "Validating portfolio holdings",
    detail: "Checking symbols, quantities, and buy prices",
  },
  {
    title: "Fetching live PSX market data",
    detail: "Pulling current prices from Pakistan Stock Exchange",
  },
  {
    title: "Loading technical indicators",
    detail: "RSI, trends, and fundamentals for each holding",
  },
  {
    title: "Scanning Pakistan market news",
    detail: "Gathering latest PSX and macro headlines",
  },
  {
    title: "AI analyzing your portfolio",
    detail: "Gemini model evaluating risk and recommendations",
  },
  {
    title: "Finalizing your report",
    detail: "Preparing holdings table and risk summary",
  },
] as const;

const STEP_DURATIONS_MS = [900, 1400, 1600, 1200, 1800, 800];

type StepStatus = "pending" | "active" | "complete";

type AnalysisProgressModalProps = {
  open: boolean;
  symbols: string[];
  apiDone: boolean;
  error?: string | null;
  onComplete: () => void;
};

function getStepStatus(index: number, activeStep: number): StepStatus {
  if (index < activeStep) return "complete";
  if (index === activeStep) return "active";
  return "pending";
}

export default function AnalysisProgressModal({
  open,
  symbols,
  apiDone,
  error,
  onComplete,
}: AnalysisProgressModalProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setActiveStep(0);
      return;
    }
    const timer = setTimeout(() => setVisible(false), 200);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || error) return;

    const lastIndex = STEPS.length - 1;

    if (activeStep >= lastIndex) {
      if (apiDone) {
        const timer = setTimeout(() => onComplete(), 700);
        return () => clearTimeout(timer);
      }
      return;
    }

    const aiStepIndex = STEPS.length - 2;
    if (activeStep >= aiStepIndex && !apiDone) {
      return;
    }

    let duration = STEP_DURATIONS_MS[activeStep] ?? 1200;
    if (apiDone && activeStep >= aiStepIndex) {
      duration = 450;
    }

    const timer = setTimeout(() => {
      setActiveStep((current) => current + 1);
    }, duration);

    return () => clearTimeout(timer);
  }, [open, activeStep, apiDone, error, onComplete]);

  useEffect(() => {
    if (!open || !error) return;
    const timer = setTimeout(() => onComplete(), 1500);
    return () => clearTimeout(timer);
  }, [open, error, onComplete]);

  if (!visible) return null;

  const symbolLabel =
    symbols.length > 0 ? symbols.join(", ") : "your holdings";

  const progressPercent = Math.min(
    100,
    ((activeStep + (apiDone && activeStep >= STEPS.length - 1 ? 1 : 0.4)) /
      STEPS.length) *
      100,
  );

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-200 ${
        open ? "opacity-100" : "opacity-0"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="analysis-progress-title"
    >
      <div className="absolute inset-0 bg-[#0B132B]/70 backdrop-blur-sm" />

      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            {error ? (
              <AlertCircle className="h-6 w-6 text-red-500" />
            ) : (
              <Sparkles className="h-6 w-6 text-emerald-500" />
            )}
          </div>
          <div>
            <h2
              id="analysis-progress-title"
              className="text-xl font-bold text-[#0B132B]"
            >
              {error ? "Analysis failed" : "AI Portfolio Analysis"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {error
                ? error
                : `Analyzing ${symbolLabel}. Please wait while SmartSarmaya completes each step.`}
            </p>
          </div>
        </div>

        {!error && (
          <>
            <ol className="space-y-0">
              {STEPS.map((step, index) => {
                const status = getStepStatus(index, activeStep);
                const isLast = index === STEPS.length - 1;

                return (
                  <li key={step.title} className="relative flex gap-4">
                    {!isLast && (
                      <span
                        className={`absolute left-[15px] top-8 h-[calc(100%-8px)] w-0.5 ${
                          status === "complete" ? "bg-emerald-400" : "bg-slate-200"
                        }`}
                        aria-hidden
                      />
                    )}

                    <div className="relative z-10 mt-0.5 shrink-0">
                      {status === "complete" && (
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      )}
                      {status === "active" && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15">
                          <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                        </div>
                      )}
                      {status === "pending" && (
                        <Circle className="h-8 w-8 text-slate-300" />
                      )}
                    </div>

                    <div className={`pb-6 ${isLast ? "pb-0" : ""}`}>
                      <p
                        className={`font-semibold ${
                          status === "active"
                            ? "text-[#0B132B]"
                            : status === "complete"
                              ? "text-emerald-700"
                              : "text-slate-400"
                        }`}
                      >
                        {step.title}
                      </p>
                      <p
                        className={`mt-0.5 text-sm ${
                          status === "pending" ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        {step.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
