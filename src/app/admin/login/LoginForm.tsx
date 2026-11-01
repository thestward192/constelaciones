"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { requestLoginLink, type LoginState } from "./actions";
import styles from "../admin.module.css";

const initial: LoginState = { status: "idle", message: "" };

export default function LoginForm() {
  const [state, action, pending] = useActionState(requestLoginLink, initial);
  const linkError = useSearchParams().get("error") === "enlace";

  return (
    <form action={action} className={styles.loginForm}>
      <label htmlFor="email">Correo</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="tu@correo.com"
      />
      <button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviarme un enlace"}
      </button>
      {linkError && state.status === "idle" && (
        <p className={styles.formError} role="alert">
          El enlace no es válido o ya venció. Pide uno nuevo.
        </p>
      )}
      {state.status !== "idle" && (
        <p className={state.status === "error" ? styles.formError : styles.formOk} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
