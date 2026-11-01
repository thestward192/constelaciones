import { formatNumber } from "@/lib/format";
import type { SkyIndex } from "@/sky/public-files";
import styles from "./app.module.css";

interface Props {
  index: SkyIndex | null;
  /** The logo always returns to the Sun. */
  onHome: () => void;
}

/** Project name, day of the challenge and the current stage with its progress. */
export default function TopBar({ index, onHome }: Props) {
  const stage = index ? index.stages[Math.min(index.stage, index.stages.length) - 1] : null;
  const done = index?.totalConstellations ?? 0;
  const progress = stage ? Math.min(100, (done / stage[1]) * 100) : 0;

  return (
    <header className={styles.top}>
      <div className={styles.brand}>
        <h1>
          <button type="button" onClick={onHome} aria-label="Constelaciones. Ver todo el cielo">
            Constelaciones
          </button>
        </h1>
        {index?.day ? <span className={styles.day}>Día {index.day} de 365</span> : null}
      </div>
      {stage && (
        <div className={styles.stage}>
          <div className={styles.stageLabel}>
            <span className={styles.long}>Etapa {index!.stage} · </span>
            <b>{stage[0]}</b> · {formatNumber(done)} de {formatNumber(stage[1])}
          </div>
          <div
            className={styles.bar}
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progreso de ${stage[0]}`}
          >
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </header>
  );
}
