import { Suspense } from "react";
import { toRoman } from "@/map/style";
import { blockedWords, starsWithStatus, type ModerationStar } from "@/server/admin/queries";
import { requireAdmin } from "@/server/admin/session";
import { addBlockedWord, removeBlockedWord, setStarStatus } from "../../actions";
import ActionForm from "../ActionForm";
import styles from "../../admin.module.css";

export default function ModerationPage() {
  return (
    <Suspense fallback={<p className={styles.loading}>Cargando la moderación</p>}>
      <ModerationContent />
    </Suspense>
  );
}

async function ModerationContent() {
  await requireAdmin();
  const [review, hidden, words] = await Promise.all([
    starsWithStatus("review"),
    starsWithStatus("hidden", 50),
    blockedWords(),
  ]);

  return (
    <>
      <div className={styles.pageTitle}>
        <h1>Moderación</h1>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Nombres en revisión ({review.length})</h2>
          <p className={styles.muted}>
            Estos nombres coincidieron con una palabra bloqueada. Tienen su lugar en el cielo, pero
            no se muestran hasta que los apruebes. Los cambios se ven al publicar.
          </p>
          <StarList stars={review} empty="No hay nombres esperando revisión." />
        </section>

        <section className={styles.card}>
          <h2>Palabras bloqueadas ({words.length})</h2>
          <p className={styles.muted}>
            Un nombre nuevo que contenga una de estas palabras queda en revisión. No afecta a los
            nombres que ya están en el cielo.
          </p>
          <div className={styles.words}>
            {words.map((word) => (
              <span key={word} className={styles.word}>
                {word}
                <ActionForm action={removeBlockedWord} submit="×" variant="inline">
                  <input type="hidden" name="word" value={word} />
                </ActionForm>
              </span>
            ))}
          </div>
          <ActionForm action={addBlockedWord} submit="Agregar palabra">
            <label className={styles.field}>
              Nueva palabra
              <input name="word" required minLength={2} maxLength={30} />
            </label>
          </ActionForm>
        </section>

        <section className={styles.card}>
          <h2>Nombres ocultos</h2>
          <p className={styles.muted}>Los últimos 50. Puedes volver a mostrarlos.</p>
          <StarList stars={hidden} empty="No hay nombres ocultos." />
        </section>
      </div>
    </>
  );
}

function StarList({ stars, empty }: { stars: ModerationStar[]; empty: string }) {
  if (!stars.length) return <p className={styles.muted}>{empty}</p>;
  return (
    <ul className={styles.list}>
      {stars.map((s) => (
        <li key={s.id}>
          <span>
            <span className={styles.mono}>@{s.username}</span>
            <br />
            <small className={styles.muted}>
              Constelación {toRoman(s.constellation_id)} · día {s.born_day}
            </small>
          </span>
          <span className={styles.row}>
            <ActionForm action={setStarStatus} submit="Aprobar" variant="inline">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="status" value="active" />
            </ActionForm>
            {s.status !== "hidden" && (
              <ActionForm action={setStarStatus} submit="Ocultar" variant="inline">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="status" value="hidden" />
              </ActionForm>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
