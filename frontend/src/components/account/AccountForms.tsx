"use client";

import { useActionState, useState } from "react";

import { deleteAccountAction, saveProfileAction, type AccountState } from "@/app/account/actions";
import type { Profile } from "@/lib/portfolio";

const INPUT = "focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

function Message({ state }: { state: AccountState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-rose-600">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="mt-2 text-sm text-emerald-700">
        {state.ok}
      </p>
    );
  }
  return null;
}

const LABEL = "block text-sm font-semibold text-navy-900";

/** Name and phone, with the sign-in email shown but not editable here. */
export function ProfileForm({
  profile,
  email,
}: {
  profile: Pick<Profile, "first_name" | "last_name" | "phone">;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(saveProfileAction, {});
  // Controlled, because React resets a form's uncontrolled fields after every
  // action, including one that returns an error, which wiped what was typed.
  const [first, setFirst] = useState(profile.first_name);
  const [last, setLast] = useState(profile.last_name);
  const [phone, setPhone] = useState(profile.phone);
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="first_name" className={LABEL}>First name</label>
        <input id="first_name" name="first_name" maxLength={60} autoComplete="given-name" value={first} onChange={(event) => setFirst(event.target.value)} className={`${INPUT} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="last_name" className={LABEL}>Last name</label>
        <input id="last_name" name="last_name" maxLength={60} autoComplete="family-name" value={last} onChange={(event) => setLast(event.target.value)} className={`${INPUT} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="phone" className={LABEL}>
          Phone <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+92 300 1234567"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className={`${INPUT} mt-1.5`}
        />
      </div>
      <div>
        <label htmlFor="email" className={LABEL}>Email</label>
        <input id="email" type="email" value={email} readOnly aria-describedby="email-note" className={`${INPUT} mt-1.5 bg-slate-50 text-slate-600`} />
        <p id="email-note" className="mt-1 text-xs text-slate-500">This is the address you sign in with.</p>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="focus-ring rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, {});
  return (
    <form action={formAction}>
      <label htmlFor="confirm" className="block text-sm text-slate-700">
        Type <span className="font-mono font-semibold">DELETE</span> to confirm
      </label>
      <div className="mt-1.5 flex gap-2">
        <input id="confirm" name="confirm" autoComplete="off" className={INPUT} />
        <button
          type="submit"
          disabled={pending}
          className="focus-ring shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete account"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}
