"use server";

import { headers } from "next/headers";
import { isAdminEmail } from "@/server/admin/emails";
import { createSessionClient } from "@/server/admin/session";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message: string;
}

/**
 * Sends a sign-in link, only to allowed emails. The answer is the same either way, so the
 * page never reveals which emails have access.
 */
export async function requestLoginLink(_previous: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Escribe un correo válido." };
  }

  if (isAdminEmail(email)) {
    const h = await headers();
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/admin/auth/callback` },
    });
    if (error) {
      return {
        status: "error",
        message:
          error.status === 429
            ? "Ya pediste un enlace hace poco. Espera unos minutos e inténtalo de nuevo."
            : "No se pudo enviar el enlace. Inténtalo de nuevo en un momento.",
      };
    }
  }
  return {
    status: "sent",
    message:
      "Si este correo tiene acceso, te llegará un enlace para entrar. Revisa también la carpeta de spam.",
  };
}
