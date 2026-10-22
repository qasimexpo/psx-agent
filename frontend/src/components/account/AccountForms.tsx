"use client";

import { useActionState } from "react";

import { deleteAccountAction, saveNameAction, type AccountState } from "@/app/account/actions";

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

export function NameForm({ initial }: { initial: string }) {
  const [state, formAction, pending] = useActionState(saveNameAction, {});
  return (
    <form action={formAction}>
      <label htmlFor="display_name" className="block text-sm font-semibold text-navy-900">
        Display name
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="display_name"
          name="display_name"
          maxLength={80}
          defaultValue={initial}
          className={INPUT}
        />
        <button
          type="submit"
          disabled={pending}
          className="focus-ring shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <Message state={state} />
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
