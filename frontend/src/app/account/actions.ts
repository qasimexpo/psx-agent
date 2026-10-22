"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient, deleteAuthUser, getSessionUser } from "@/lib/auth/server";
import { deleteUserData, saveDisplayName } from "@/lib/portfolio";

export type AccountState = { error?: string; ok?: string };

export async function saveNameAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session has ended. Sign in again to continue." };

  const name = String(formData.get("display_name") ?? "").replace(/\s+/g, " ").trim();
  if (name.length > 80) return { error: "Keep the name under 80 characters." };

  try {
    await saveDisplayName(user.id, name);
  } catch (error) {
    console.error("[account] save name failed:", error instanceof Error ? error.message : error);
    return { error: "Something went wrong saving that. Please try again." };
  }
  revalidatePath("/account");
  revalidatePath("/portfolio");
  return { ok: "Saved." };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * Deletes the sign-in first: if that fails nothing has been lost and the user
 * can try again. Once it succeeds the holdings and profile are erased, then
 * the session cookies cleared. Typing DELETE guards against a stray click.
 */
export async function deleteAccountAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session has ended. Sign in again to continue." };
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") {
    return { error: "Type DELETE in capitals to confirm." };
  }

  if (!(await deleteAuthUser(user.id))) {
    return {
      error: "We could not delete the account right now. Email us and we will remove it by hand.",
    };
  }
  try {
    await deleteUserData(user.id);
  } catch (error) {
    // The sign-in is gone, so the rows are unreachable; log them for manual cleanup.
    console.error(
      `[account] data cleanup failed for ${user.id}:`,
      error instanceof Error ? error.message : error,
    );
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?account=deleted");
}
