import type { EmailOtpType, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/config";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/portfolio";

/**
 * Where an emailed link and Google sign-in land.
 *
 * Two shapes arrive here. `code` is the PKCE flow, used by Google and by the
 * default email template; it only completes in the browser that asked for the
 * link. `token_hash` comes from an email template that links here directly and
 * works on any device. Either way the session cookies are set on this response
 * and the profile row is created on the first visit.
 */
export const dynamic = "force-dynamic";

function defaultName(user: User): string {
  const meta = user.user_metadata ?? {};
  const fromProvider = String(meta.full_name ?? meta.name ?? "").trim();
  return fromProvider || (user.email ?? "").split("@")[0];
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const supabase = await createSupabaseServerClient();
  let user: User | null = null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) user = data.user;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) user = data.user;
  }

  if (!user) {
    const retry = new URL("/login", request.nextUrl.origin);
    retry.searchParams.set("error", "link");
    retry.searchParams.set("next", next);
    return NextResponse.redirect(retry);
  }

  try {
    const meta = user.user_metadata ?? {};
    await ensureProfile(
      user.id,
      defaultName(user),
      String(meta.given_name ?? "").trim(),
      String(meta.family_name ?? "").trim(),
    );
  } catch (error) {
    // The portfolio page works without the row; saving a name creates it later.
    console.error("[auth] ensureProfile failed:", error instanceof Error ? error.message : error);
  }
  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
