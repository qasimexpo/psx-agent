import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isAuthConfigured } from "./config";

/**
 * A Supabase client bound to this request's cookies. Create one per request;
 * never share it. Server Components cannot write cookies, so a token refresh
 * there is dropped silently and the proxy (src/proxy.ts) persists it instead.
 */
export async function createSupabaseServerClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component render; the proxy handles it.
        }
      },
    },
  });
}

export type SessionUser = { id: string; email: string; name: string };

/**
 * The signed-in user, verified with the Auth server rather than read from the
 * cookie: a cookie is client-supplied, and every portfolio query is scoped by
 * the id this returns.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isAuthConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const meta = data.user.user_metadata ?? {};
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    name: String(meta.full_name ?? meta.name ?? "").slice(0, 80),
  };
}

/** The signed-in user, or a redirect to the sign-in page that returns here afterwards. */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/**
 * Removes the user from Supabase Auth. Needs the project's secret key, which
 * bypasses every check, so it is read here on the server only and never given
 * a NEXT_PUBLIC_ name. Returns false when the key is missing or the call fails.
 */
export async function deleteAuthUser(id: string): Promise<boolean> {
  const secret = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  if (!secret || !SUPABASE_URL) return false;
  const admin = createClient(SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.error("[auth] deleteUser failed:", error.message);
    return false;
  }
  return true;
}
