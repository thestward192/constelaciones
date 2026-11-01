import Link from "next/link";
import { Suspense } from "react";
import { listDays } from "@/server/admin/queries";
import { requireAdmin } from "@/server/admin/session";
import { createDay, setDayClosed, updateDay } from "../../actions";
import ActionForm from "../ActionForm";
import LocalTime from "../LocalTime";
import styles from "../../admin.module.css";

export default function DaysPage() {
  return (
    <Suspense fallback={<p className={styles.loading}>Cargando los días</p>}>
      <DaysContent />
    </Suspense>
  );
}

/** "2026-11-04T18:30:00+00:00" → value for <input type="datetime-local"> (UTC). */
const toInput = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

async function DaysContent() {
  await requireAdmin();
  const days = await listDays();
  const nextDay = (days[0]?.day ?? 0) + 1;

  return (
    <>
      <div className={styles.pageTitle}>
        <h1>Días del reto</h1>
      </div>

      <div className={styles.grid} style={{ marginBottom: 16 }}>
        <section className={styles.card}>
          <h2>Crear el día {nextDay}</h2>
          <p className={styles.muted}>
            Cada video es un día. Puedes pegar el enlace del video, o elegirlo de la lista en la
            página{" "}
            <Link href="/admin/instagram" className={styles.link}>
              Instagram
            </Link>
            .
          </p>
          <ActionForm action={createDay} submit={`Crear día ${nextDay}`}>
            <div className={styles.row}>
              <label className={styles.field}>
                Número de día
                <input name="day" type="number" min={1} defaultValue={nextDay} required />
              </label>
              <label className={styles.field}>
                Publicación del video (UTC)
                <input name="published_at" type="datetime-local" />
              </label>
            </div>
            <label className={styles.field}>
              Video de Instagram (enlace o código)
              <input name="ig_media_id" placeholder="https://www.instagram.com/reel/…" />
            </label>
          </ActionForm>
        </section>
      </div>

      <section className={styles.card}>
        <h2>Todos los días</h2>
        {days.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Video y publicación</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day}>
                    <td className={styles.mono}>
                      <Link href={`/admin?dia=${d.day}`} className={styles.link}>
                        {d.day}
                      </Link>
                    </td>
                    <td>
                      <ActionForm action={updateDay} submit="Guardar" variant="inline">
                        <input type="hidden" name="day" value={d.day} />
                        <input
                          name="ig_media_id"
                          defaultValue={d.ig_media_id ?? ""}
                          placeholder="Video"
                          aria-label={`Video del día ${d.day}`}
                        />
                        <input
                          name="published_at"
                          type="datetime-local"
                          defaultValue={toInput(d.published_at)}
                          aria-label={`Publicación del día ${d.day}`}
                        />
                      </ActionForm>
                      <small className={styles.muted}>
                        <LocalTime iso={d.published_at} />
                      </small>
                    </td>
                    <td>
                      <ActionForm
                        action={setDayClosed}
                        submit={d.closed ? "Abrir" : "Cerrar"}
                        variant="inline"
                        confirm={
                          d.closed
                            ? undefined
                            : `¿Cerrar el día ${d.day}? Ya no se podrán importar comentarios para ese día.`
                        }
                      >
                        <input type="hidden" name="day" value={d.day} />
                        <input type="hidden" name="closed" value={d.closed ? "false" : "true"} />
                        <span className={d.closed ? styles.tag : `${styles.tag} ${styles.tagGold}`}>
                          {d.closed ? "Cerrado" : "Abierto"}
                        </span>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.muted}>Todavía no hay días.</p>
        )}
      </section>
    </>
  );
}
