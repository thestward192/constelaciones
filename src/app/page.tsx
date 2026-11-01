import SkyView from "@/components/sky/SkyView";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main>
      <SkyView />
      <h1 className={styles.brand}>Constelaciones</h1>
    </main>
  );
}
