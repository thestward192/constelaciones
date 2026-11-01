import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./LoginForm";
import styles from "../admin.module.css";

export const metadata: Metadata = {
  title: "Entrar · Panel de Constelaciones",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <main className={styles.loginPage}>
      <div className={styles.loginCard}>
        <p className={styles.eyebrow}>Panel de administración</p>
        <h1 className={styles.loginTitle}>Constelaciones</h1>
        <p className={styles.muted}>
          Te enviaremos un enlace a tu correo para entrar. No hace falta contraseña.
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
