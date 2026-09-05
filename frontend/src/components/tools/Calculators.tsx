"use client";

import { useMemo, useState } from "react";

/**
 * Three small calculators for PSX investors. Everything runs in the browser and
 * nothing is sent anywhere. Empty or invalid input shows a dash rather than NaN.
 */

const PKR = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WHOLE = new Intl.NumberFormat("en-PK", {
  maximumFractionDigits: 0,
});

const DASH = "—";

/** Parses a text input into a usable non negative number, or null. */
function num(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function rupees(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  return `Rs ${PKR.format(value)}`;
}

function signedRupees(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  const sign = value < 0 ? "-" : "";
  return `${sign}Rs ${PKR.format(Math.abs(value))}`;
}

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  return `${value.toFixed(2)}%`;
}

type FilerStatus = "filer" | "nonFiler";

const TAX_RATE: Record<FilerStatus, number> = {
  filer: 0.15,
  nonFiler: 0.3,
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  step = "0.01",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <span className="relative mt-1 block">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="tabular focus-ring w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-12 text-sm text-navy-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400"
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function FilerToggle({
  value,
  onChange,
}: {
  value: FilerStatus;
  onChange: (next: FilerStatus) => void;
}) {
  return (
    <div>
      <span className="text-xs font-semibold text-slate-600">Tax status</span>
      <div className="mt-1 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        <button
          type="button"
          onClick={() => onChange("filer")}
          aria-pressed={value === "filer"}
          className={`focus-ring rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            value === "filer"
              ? "bg-emerald-500 text-white"
              : "text-slate-600 hover:text-navy-900"
          }`}
        >
          Filer (15%)
        </button>
        <button
          type="button"
          onClick={() => onChange("nonFiler")}
          aria-pressed={value === "nonFiler"}
          className={`focus-ring rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            value === "nonFiler"
              ? "bg-emerald-500 text-white"
              : "text-slate-600 hover:text-navy-900"
          }`}
        >
          Non filer (30%)
        </button>
      </div>
    </div>
  );
}

function Result({
  label,
  value,
  hint,
  tone = "default",
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
  emphasis?: boolean;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-rose-600"
        : "text-navy-900";
  return (
    <div className={`rounded-xl px-4 py-3 ${emphasis ? "bg-navy-900" : "bg-slate-50"}`}>
      <p
        className={`text-[11px] font-semibold uppercase tracking-wider ${
          emphasis ? "text-slate-300" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <p
        className={`tabular mt-0.5 text-lg font-bold ${emphasis ? "text-white" : toneClass}`}
      >
        {value}
      </p>
      {hint ? (
        <p className={`mt-0.5 text-xs ${emphasis ? "text-slate-400" : "text-slate-500"}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function CalculatorCard({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <p className="eyebrow">{step}</p>
      <h2 className="mt-1 text-lg font-bold text-navy-900">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</p>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------ capital gains */

function CapitalGainsCalculator() {
  const [buy, setBuy] = useState("");
  const [sell, setSell] = useState("");
  const [qty, setQty] = useState("");
  const [status, setStatus] = useState<FilerStatus>("filer");

  const result = useMemo(() => {
    const buyPrice = num(buy);
    const sellPrice = num(sell);
    const shares = num(qty);
    if (buyPrice === null || sellPrice === null || shares === null || shares <= 0) {
      return null;
    }
    const cost = buyPrice * shares;
    const proceeds = sellPrice * shares;
    const gain = proceeds - cost;
    const tax = gain > 0 ? gain * TAX_RATE[status] : 0;
    const net = gain - tax;
    const returnPct = cost > 0 ? (net / cost) * 100 : null;
    return { cost, proceeds, gain, tax, net, returnPct };
  }, [buy, sell, qty, status]);

  return (
    <CalculatorCard
      step="Calculator 1"
      title="Capital gains tax on a PSX trade"
      description="Capital gains tax on listed shares is charged at 15 percent for filers and 30 percent for non filers on the realised gain. A loss is not taxed."
    >
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Buy price" value={buy} onChange={setBuy} placeholder="120.50" suffix="PKR" />
        <Field
          label="Sell price"
          value={sell}
          onChange={setSell}
          placeholder="145.00"
          suffix="PKR"
        />
        <Field label="Quantity" value={qty} onChange={setQty} placeholder="500" step="1" />
      </div>
      <div className="mt-4">
        <FilerToggle value={status} onChange={setStatus} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Result
          label="Total cost"
          value={rupees(result ? result.cost : null)}
          hint="What you paid"
        />
        <Result
          label={result && result.gain < 0 ? "Gross loss" : "Gross gain"}
          value={signedRupees(result ? result.gain : null)}
          tone={result ? (result.gain >= 0 ? "positive" : "negative") : "default"}
          hint={`Sale proceeds ${rupees(result ? result.proceeds : null)}`}
        />
        <Result
          label={`Tax at ${status === "filer" ? "15%" : "30%"}`}
          value={rupees(result ? result.tax : null)}
          tone={result && result.tax > 0 ? "negative" : "default"}
          hint={result && result.gain <= 0 ? "No tax on a loss" : "Deducted by your broker"}
        />
        <Result
          label="Net after tax"
          value={signedRupees(result ? result.net : null)}
          hint={result ? `${pct(result.returnPct)} on cost` : undefined}
          emphasis
        />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        This ignores brokerage commission, CDC and settlement charges, and any loss carried forward
        from earlier trades, all of which change the real figure. Holding period rules and rates
        change with each Finance Act.
      </p>
    </CalculatorCard>
  );
}

/* ---------------------------------------------------------------- dividends */

function DividendCalculator() {
  const [price, setPrice] = useState("");
  const [dps, setDps] = useState("");
  const [shares, setShares] = useState("");
  const [status, setStatus] = useState<FilerStatus>("filer");

  const result = useMemo(() => {
    const sharePrice = num(price);
    const perShare = num(dps);
    const count = num(shares);
    if (perShare === null || count === null || count <= 0) return null;

    const gross = perShare * count;
    const withholding = gross * TAX_RATE[status];
    const net = gross - withholding;
    const grossYield = sharePrice !== null && sharePrice > 0 ? (perShare / sharePrice) * 100 : null;
    const netYield =
      sharePrice !== null && sharePrice > 0
        ? ((perShare * (1 - TAX_RATE[status])) / sharePrice) * 100
        : null;
    const invested = sharePrice !== null ? sharePrice * count : null;
    return { gross, withholding, net, grossYield, netYield, invested };
  }, [price, dps, shares, status]);

  return (
    <CalculatorCard
      step="Calculator 2"
      title="Dividend income and yield"
      description="Work out what a declared dividend actually pays you after withholding tax, and what that is as a yield on the current share price."
    >
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field
          label="Share price"
          value={price}
          onChange={setPrice}
          placeholder="180.00"
          suffix="PKR"
        />
        <Field
          label="Dividend per share"
          value={dps}
          onChange={setDps}
          placeholder="12.50"
          suffix="PKR"
        />
        <Field
          label="Shares held"
          value={shares}
          onChange={setShares}
          placeholder="1000"
          step="1"
        />
      </div>
      <div className="mt-4">
        <FilerToggle value={status} onChange={setStatus} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Result
          label="Gross dividend"
          value={rupees(result ? result.gross : null)}
          hint={
            result && result.invested !== null
              ? `On ${rupees(result.invested)} invested`
              : "Before tax"
          }
        />
        <Result
          label={`Withholding at ${status === "filer" ? "15%" : "30%"}`}
          value={rupees(result ? result.withholding : null)}
          tone={result && result.withholding > 0 ? "negative" : "default"}
          hint="Deducted at source"
        />
        <Result
          label="Gross yield"
          value={pct(result ? result.grossYield : null)}
          hint={result && result.grossYield === null ? "Enter a share price" : "Per year, on price"}
        />
        <Result
          label="Net dividend"
          value={rupees(result ? result.net : null)}
          hint={result && result.netYield !== null ? `${pct(result.netYield)} net yield` : undefined}
          emphasis
        />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Yield here assumes the dividend you entered is the full annual payout. A company paying
        quarterly will show a much lower yield if you enter only one interim dividend. You must
        hold the shares before the book closure date to receive a declared dividend.
      </p>
    </CalculatorCard>
  );
}

/* -------------------------------------------------------------- compounding */

function CompoundingCalculator() {
  const [initial, setInitial] = useState("");
  const [monthly, setMonthly] = useState("");
  const [rate, setRate] = useState("");
  const [years, setYears] = useState("");

  const result = useMemo(() => {
    const principal = num(initial) ?? 0;
    const contribution = num(monthly) ?? 0;
    const annualRate = num(rate);
    const duration = num(years);

    if (annualRate === null || duration === null || duration <= 0) return null;
    if (principal === 0 && contribution === 0) return null;
    if (duration > 100) return null;

    const months = Math.round(duration * 12);
    const monthlyRate = annualRate / 100 / 12;

    let future: number;
    if (monthlyRate === 0) {
      future = principal + contribution * months;
    } else {
      const growth = Math.pow(1 + monthlyRate, months);
      future = principal * growth + contribution * ((growth - 1) / monthlyRate);
    }

    if (!Number.isFinite(future)) return null;

    const contributed = principal + contribution * months;
    const gain = future - contributed;
    const multiple = contributed > 0 ? future / contributed : null;
    return { future, contributed, gain, months, multiple };
  }, [initial, monthly, rate, years]);

  return (
    <CalculatorCard
      step="Calculator 3"
      title="Investment growth over time"
      description="What a starting amount plus a regular monthly contribution turns into at a steady annual return. Returns are compounded monthly."
    >
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Starting amount"
          value={initial}
          onChange={setInitial}
          placeholder="100000"
          suffix="PKR"
        />
        <Field
          label="Monthly contribution"
          value={monthly}
          onChange={setMonthly}
          placeholder="10000"
          suffix="PKR"
        />
        <Field
          label="Annual return"
          value={rate}
          onChange={setRate}
          placeholder="15"
          suffix="%"
          step="0.1"
        />
        <Field label="Years" value={years} onChange={setYears} placeholder="10" step="1" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Result
          label="Total contributed"
          value={rupees(result ? result.contributed : null)}
          hint={result ? `Over ${WHOLE.format(result.months)} months` : "Your own money in"}
        />
        <Result
          label="Total gain"
          value={signedRupees(result ? result.gain : null)}
          tone={result ? (result.gain >= 0 ? "positive" : "negative") : "default"}
          hint="Growth on top of contributions"
        />
        <Result
          label="Final value"
          value={rupees(result ? result.future : null)}
          hint={
            result && result.multiple !== null
              ? `${result.multiple.toFixed(2)}x what you put in`
              : undefined
          }
          emphasis
        />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        A steady annual return is a modelling convenience, not something the Pakistan Stock Exchange
        provides. Real returns arrive unevenly and some years are negative. This also ignores
        inflation, capital gains tax on the way out, and brokerage costs.
      </p>
    </CalculatorCard>
  );
}

export default function Calculators() {
  return (
    <div className="space-y-5">
      <CapitalGainsCalculator />
      <DividendCalculator />
      <CompoundingCalculator />
    </div>
  );
}
