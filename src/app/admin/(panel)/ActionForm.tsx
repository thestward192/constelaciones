"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "../actions";
import styles from "../admin.module.css";

interface Props {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  submit: string;
  children?: ReactNode;
  /** Asks before sending (for things that cannot be undone). */
  confirm?: string;
  variant?: "primary" | "secondary" | "inline";
}

/** A form bound to a server action, showing what happened right under it. */
export default function ActionForm({
  action,
  submit,
  children,
  confirm,
  variant = "primary",
}: Props) {
  const [state, formAction, pending] = useActionState(action, { ok: null, message: "" });
  const classes = [
    styles.form,
    variant === "secondary" ? styles.secondary : "",
    variant === "inline" ? styles.inline : "",
  ].join(" ");
  return (
    <form
      action={formAction}
      className={classes}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <button type="submit" disabled={pending}>
        {pending ? "Un momento…" : submit}
      </button>
      {state.message && (
        <p className={state.ok ? styles.formOk : styles.formError} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
