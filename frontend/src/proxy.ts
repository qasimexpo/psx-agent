import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isAuthConfigured } from "@/lib/auth/config";

/**
 * Keeps a signed-in session alive on the account pages.
 *
 * Access tokens are short lived and Server Components cannot write cookies, so
 * the refreshed token is written here, before the page renders. This is not the
 * access check: each page verifies the user itself. The matcher limits it to
 * the pages that use a session, so the rest of the site stays static and pays
 * nothing for accounts existing.
 */
export async function proxy(request: NextRequest) {
  if (!isAuthConfigured()) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Cache-Control headers that stop a CDN caching a response carrying a session.
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/portfolio/:path*", "/account/:path*", "/login"],
};
