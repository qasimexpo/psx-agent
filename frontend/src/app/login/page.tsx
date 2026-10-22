import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import LoginForm from "@/components/account/LoginForm";
import { EmptyState } from "@/components/ui/Primitives";
import { isAuthConfigured, safeNext } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to SmartSarmaya to track your PSX portfolio.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one below.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  if (!isAuthConfigured()) {
    return (
      <div className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-md">
          <EmptyState
            icon={<LockKeyhole className="h-8 w-8" aria-hidden />}
            title="Accounts are not switched on yet"
            description="Signing in will be available shortly. Every other tool on the site works without an account."
          />
        </div>
      </div>
    );
  }

  if (await getSessionUser()) redirect(next);

  return (
    <div className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-md">
        <LoginForm next={next} error={params.error ? ERRORS[params.error] ?? null : null} />
      </div>
    </div>
  );
}
