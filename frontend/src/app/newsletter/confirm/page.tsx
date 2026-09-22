import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

import { confirm } from "@/lib/subscribers";

/**
 * The link at the bottom of the first email. Confirming on a plain GET is safe
 * here: the worst an email scanner can do by following it is the very thing
 * the reader asked for. Unsubscribing is the opposite, so that page asks.
 */
export const metadata: Metadata = {
  title: "Confirm your newsletter subscription",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const email = token ? await confirm(token) : null;

  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="card mx-auto max-w-xl p-8">
        {email ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-900">
              You are subscribed
            </h1>
            <p className="mt-3 leading-relaxed text-slate-600">
              {email} will get the brief once per trading day. Every email carries an
              unsubscribe link, and the address is never shared or sold.
            </p>
          </>
        ) : (
          <>
            <XCircle className="h-10 w-10 text-rose-500" aria-hidden />
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-900">
              That link is not valid
            </h1>
            <p className="mt-3 leading-relaxed text-slate-600">
              The link may have been replaced by a newer one, or copied incompletely. Sign
              up again from the home page and a fresh link will be sent.
            </p>
          </>
        )}

        <Link
          href="/"
          className="focus-ring mt-6 inline-flex items-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          Back to SmartSarmaya
        </Link>
      </div>
    </section>
  );
}
