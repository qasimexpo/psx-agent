"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient, deleteAuthUser, getSessionUser } from "@/lib/auth/server";
import { deleteUserData, saveProfile } from "@/lib/portfolio";

export type AccountState = { error?: string; ok?: string };

const NAME = /^[\p{L}\p{M} .'-]*$/u;

function readName(formData: FormData, field: string): string | null {
  const value = String(formData.get(field) ?? "").replace(/\s+/g, " ").trim();
  return value.length <= 60 && NAME.test(value) ? value : null;
}

/** Keeps a leading + and the digits; 10 to 15 digits, or empty to remove it. */
function readPhone(formData: FormData): string | null {
  const raw = String(formData.get("phone") ?? "").trim();
  if (!raw) return "";
  if (!/^\+?[\d\s()-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return `${raw.startsWith("+") ? "+" : ""}${digits}`;
}

export async function saveProfileAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session has ended. Sign in again to continue." };

  const first = readName(formData, "first_name");
  const last = readName(formData, "last_name");
  const phone = readPhone(formData);
  if (first === null || last === null) {
    return { error: "Use letters, spaces, hyphens or apostrophes in names, up to 60 characters." };
  }
  if (phone === null) {
    return { error: "Enter the phone number with 10 to 15 digits, for example +92 300 1234567." };
  }

  try {
    await saveProfile(user.id, { first_name: first, last_name: last, phone });
  } catch (error) {
    console.error("[account] save profile failed:", error instanceof Error ? error.message : error);
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
