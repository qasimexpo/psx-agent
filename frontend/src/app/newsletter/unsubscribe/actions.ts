"use server";

import { redirect } from "next/navigation";

import { unsubscribe } from "@/lib/subscribers";

/**
 * Lives in its own module so `redirect` is a normal top-level import. Called
 * from the unsubscribe page's form; the token comes from the hidden field
 * rather than the URL, so the action is self-contained.
 */
export async function unsubscribeAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const email = await unsubscribe(token);
  redirect(email ? "/newsletter/unsubscribe?done=1" : "/newsletter/unsubscribe");
}
