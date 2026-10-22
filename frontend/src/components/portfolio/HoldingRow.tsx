"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import {
  removeHoldingAction,
  updateHoldingAction,
  type FormState,
} from "@/app/portfolio/actions";
import { Delta, MiniTrend } from "@/components/charts/Trend";
import { HalalBadge } from "@/components/ui/Primitives";
import type { PricePoint } from "@/lib/charts";
import { changeClass, money, percent, signedMoney } from "@/lib/format";
import type { Position } from "@/lib/portfolio";

const CELL = "px-3 py-3 text-right tabular";
const INPUT = "focus-ring tabular w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm";

/**
 * One position. The stock and its trend link to the stock's full page; an
 * inline editor corrects shares or average cost.
 */
export default function HoldingRow({
  position,
  weight,
  trend,
  trendChange,
}: {
  position: Position;
  /** Share of the portfolio's market value, in percent. */
  weight: number | null;
  /** About three months of closes, ending today. */
  trend: PricePoint[];
  trendChange: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await updateHoldingAction(prev, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    {},
  );
  const formId = `edit-${position.symbol}`;
  const href = `/stock/${position.symbol}`;

  return (
    <tr className="border-t border-slate-100 align-middle transition-colors hover:bg-slate-50/70">
      <td className="px-3 py-3">
        <Link href={href} className="group block rounded focus-ring">
          <span className="font-semibold text-navy-900 underline-offset-2 group-hover:text-emerald-700 group-hover:underline">
            {position.symbol}
          </span>
          <span className="block max-w-[15rem] truncate text-xs text-slate-500">
            {position.name || "—"}
          </span>
        </Link>
        <div className="mt-1">
          <HalalBadge verified={position.is_kmi} />
        </div>
      </td>

      <td className="px-3 py-3">
        <Link
          href={href}
          className="flex items-center gap-2 rounded focus-ring"
          aria-label={`${position.symbol} chart`}
        >
          <MiniTrend
            points={trend}
            change={trendChange}
            caption={`${position.symbol} over 3 months: ${percent(trendChange)}`}
          />
          <Delta value={trendChange} className="text-xs" />
        </Link>
      </td>

      {editing ? (
        <>
          <td className={CELL}>
            <form id={formId} action={formAction}>
              <input type="hidden" name="symbol" value={position.symbol} />
            </form>
            <input
              form={formId}
              name="quantity"
              type="number"
              step="1"
              min="1"
              required
              defaultValue={position.quantity}
              aria-label={`Shares of ${position.symbol}`}
              className={INPUT}
            />
          </td>
          <td className={CELL}>
            <input
              form={formId}
              name="price"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={position.avg_price.toFixed(2)}
              aria-label={`Average cost of ${position.symbol}`}
              className={INPUT}
            />
          </td>
        </>
      ) : (
        <>
          <td className={CELL}>{position.quantity.toLocaleString("en-PK")}</td>
          <td className={CELL}>{money(position.avg_price)}</td>
        </>
      )}

      <td className={CELL}>
        <span className="font-semibold text-navy-900">{money(position.price)}</span>
        <span className="block text-xs">
          <Delta value={position.change_pct} />
        </span>
      </td>
      <td className={CELL}>
        {money(position.value)}
        <span className="block text-xs text-slate-500">
          {weight === null ? "—" : `${weight.toFixed(1)}% of portfolio`}
        </span>
      </td>
      <td className={CELL}>
        <span className={`font-semibold ${changeClass(position.pl)}`}>
          {signedMoney(position.pl)}
        </span>
        <span className="block text-xs">
          <Delta value={position.pl_pct} />
        </span>
      </td>

      <td className="px-3 py-3 text-right">
        {/* Distinct keys stop React reusing the pencil's <button> as Save: the
            browser runs a click's default action after the handler re-renders,
            so a reused node turned type="submit" would submit on the same click. */}
        {editing ? (
          <div key="edit" className="flex items-center justify-end gap-2">
            <button
              type="submit"
              form={formId}
              disabled={pending}
              className="focus-ring rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="focus-ring rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div key="view" className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${position.symbol}`}
              className="focus-ring rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <form
              action={removeHoldingAction}
              onSubmit={(event) => {
                if (!window.confirm(`Remove ${position.symbol} from your portfolio?`)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="symbol" value={position.symbol} />
              <button
                type="submit"
                aria-label={`Remove ${position.symbol}`}
                className="focus-ring rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}
        {state.error ? <p className="mt-1 text-xs text-rose-600">{state.error}</p> : null}
      </td>
    </tr>
  );
}
