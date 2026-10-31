import styles from "./page.module.css";

// Phase 0 placeholder: confirms fonts and color tokens. The sky map arrives in phase 5.
export default function Home() {
  return (
    <main className={styles.main}>
      <p className={styles.eyebrow}>Día 0 de 365</p>
      <h1 className={styles.title}>Constelaciones</h1>
      <p className={styles.lead}>La comunidad construye un universo, estrella por estrella.</p>
    </main>
  );
}
