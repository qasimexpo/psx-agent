import type { Metadata } from "next";
import Link from "next/link";
import { MailX, XCircle } from "lucide-react";

import { addressFor } from "@/lib/subscribers";

import { unsubscribeAction } from "./actions";

/**
 * Unsubscribing is a change, so it happens on a POST behind a button rather
 * than on following the link. Mail clients and security scanners fetch every
 * link in an email before the reader sees it; a GET here would quietly remove
 * people who never clicked anything.
 */
export const metadata: Metadata = {
  title: "Unsubscribe from the newsletter",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>;
}) {
  const { token, done } = await searchParams;

  if (done) {
    return (
      <Shell
        icon={<MailX className="h-10 w-10 text-slate-500" aria-hidden />}
        title="You are unsubscribed"
      >
        No further emails will be sent to that address. The site stays free to use without
        one, and you can subscribe again any time from the home page.
      </Shell>
    );
  }

  const email = token ? await addressFor(token) : null;
  if (!email) {
    return (
      <Shell
        icon={<XCircle className="h-10 w-10 text-rose-500" aria-hidden />}
        title="That link is not valid"
      >
        The address may already have been removed, or the link was copied incompletely. If
        you are still getting emails, reply to one and it will be handled by hand.
      </Shell>
    );
  }

  return (
    <Shell icon={<MailX className="h-10 w-10 text-slate-500" aria-hidden />} title="Unsubscribe">
      <p>
        Stop sending the daily brief to <span className="font-semibold">{email}</span>?
      </p>
      <form action={unsubscribeAction} className="mt-5">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="focus-ring inline-flex items-center rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
        >
          Yes, unsubscribe
        </button>
      </form>
    </Shell>
  );
}

function Shell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="card mx-auto max-w-xl p-8">
        {icon}
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-900">{title}</h1>
        <div className="mt-3 leading-relaxed text-slate-600">{children}</div>
        <Link
          href="/"
          className="focus-ring mt-6 inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-navy-900 transition hover:border-emerald-400 hover:text-emerald-700"
        >
          Back to SmartSarmaya
        </Link>
      </div>
    </section>
  );
}
