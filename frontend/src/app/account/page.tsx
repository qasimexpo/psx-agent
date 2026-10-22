import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteAccountForm, NameForm } from "@/components/account/AccountForms";
import { SectionHeading } from "@/components/ui/Primitives";
import { isAuthConfigured } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/server";
import { longDate } from "@/lib/format";
import { getProfile } from "@/lib/portfolio";

import { signOutAction } from "./actions";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  if (!isAuthConfigured()) redirect("/login");
  const user = await requireUser("/account");
  const profile = await getProfile(user.id).catch(() => null);

  return (
    <div className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <SectionHeading
          as="h1"
          eyebrow={user.email}
          title="Your account"
          description={
            profile?.created_at ? `Member since ${longDate(profile.created_at)}.` : undefined
          }
          action={
            <Link
              href="/portfolio"
              className="focus-ring inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to portfolio
            </Link>
          }
        />

        <div className="card p-5 sm:p-6">
          <NameForm initial={profile?.display_name || user.name} />
        </div>

        <div className="card mt-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-base font-bold text-navy-900">Sign out</h2>
            <p className="mt-1 text-sm text-slate-600">Ends your session on this device.</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="focus-ring rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="card mt-5 border-rose-200 p-5 sm:p-6">
          <h2 className="text-base font-bold text-rose-700">Delete account</h2>
          <p className="mt-1 mb-4 text-sm text-slate-600">
            Permanently removes your sign-in, your profile and every holding. This cannot be
            undone.
          </p>
          <DeleteAccountForm />
        </div>
      </div>
    </div>
  );
}
