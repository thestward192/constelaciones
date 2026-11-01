import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/server/admin/session";
import { signOut } from "../actions";
import styles from "../admin.module.css";

export const metadata: Metadata = { title: "Panel · Constelaciones", robots: { index: false } };

export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.brand}>
          Constelaciones <small>Panel</small>
        </p>
        <nav className={styles.nav} aria-label="Secciones del panel">
          <Link href="/admin">Día</Link>
          <Link href="/admin/dias">Días</Link>
          <Link href="/admin/instagram">Instagram</Link>
          <Link href="/admin/moderacion">Moderación</Link>
          <Link href="/admin/constelaciones">Constelaciones</Link>
          <Link href="/">Ver la página</Link>
        </nav>
        <Suspense>
          <Account />
        </Suspense>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

async function Account() {
  const { email } = await requireAdmin();
  return (
    <form action={signOut} className={styles.account}>
      <span>{email}</span>
      <button
        type="submit"
        className={styles.link}
        style={{ background: "none", border: 0, cursor: "pointer" }}
      >
        Salir
      </button>
    </form>
  );
}
