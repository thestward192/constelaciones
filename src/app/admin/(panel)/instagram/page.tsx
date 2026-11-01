import Link from "next/link";
import { Suspense } from "react";
import { formatNumber } from "@/lib/format";
import { listDays } from "@/server/admin/queries";
import { requireAdmin } from "@/server/admin/session";
import { isoTimestamp, type InstagramMedia } from "@/server/instagram/client";
import { connectInstagram } from "@/server/instagram/hourly";
import { resolveMediaId } from "@/server/instagram/import";
import { tokenStatus } from "@/server/instagram/token";
import { getAdminClient } from "@/server/supabase/admin";
import { assignVideo, saveInstagramToken } from "../../actions";
import ActionForm from "../ActionForm";
import LocalTime from "../LocalTime";
import styles from "../../admin.module.css";

export default function InstagramPage() {
  return (
    <Suspense fallback={<p className={styles.loading}>Consultando Instagram</p>}>
      <InstagramContent />
    </Suspense>
  );
}

async function InstagramContent() {
  await requireAdmin();
  const [connection, days] = await Promise.all([connectInstagram(getAdminClient()), listDays()]);
  const status = connection ? tokenStatus(connection.token) : null;

  let media: InstagramMedia[] = [];
  let mediaError: string | null = null;
  if (connection) {
    try {
      media = await connection.api.recentMedia(12);
    } catch (error) {
      mediaError = (error as Error).message;
    }
  }
  const nextDay = (days[0]?.day ?? 0) + 1;
  const dayOf = (m: InstagramMedia) =>
    days.find((d) => d.ig_media_id && resolveMediaId(d.ig_media_id, [m]) === m.id)?.day;

  return (
    <>
      <div className={styles.pageTitle}>
        <h1>Instagram</h1>
      </div>

      <div className={styles.grid} style={{ marginBottom: 16 }}>
        <section className={styles.card}>
          <h2>Conexión</h2>
          {status ? (
            <>
              <p className={styles.muted}>
                Conectado con <b>@{status.username ?? "cuenta sin nombre"}</b>. Los comentarios de
                los días abiertos se importan solos cada hora.
              </p>
              <p className={styles.runs}>
                Token conectado el <LocalTime iso={status.connected_at} />
                <br />
                Última renovación:{" "}
                {status.refreshed_at ? <LocalTime iso={status.refreshed_at} /> : "todavía no"}
                <br />
                Vence {status.expires_at ? "el" : "aproximadamente el"}{" "}
                <LocalTime iso={status.expiresAt} /> (se renueva solo cada semana)
              </p>
              {status.warning && (
                <p className={styles.formError} role="alert">
                  {status.warning}
                </p>
              )}
            </>
          ) : (
            <p className={styles.muted}>
              Instagram no está conectado. Sigue la guía <code>docs/instagram-setup.md</code> para
              obtener el token y pégalo abajo. Mientras tanto, puedes importar los comentarios a
              mano en la página Día.
            </p>
          )}
        </section>

        <section className={styles.card}>
          <h2>{status ? "Cambiar el token" : "Pegar el token"}</h2>
          <p className={styles.muted}>
            El token se comprueba con Instagram antes de guardarlo y nunca se muestra en la página
            pública.
          </p>
          <ActionForm action={saveInstagramToken} submit="Guardar token">
            <label className={styles.field}>
              Token de acceso de Instagram
              <input name="token" type="password" autoComplete="off" spellCheck={false} required />
            </label>
          </ActionForm>
        </section>
      </div>

      {connection && (
        <section className={styles.card}>
          <h2>Videos recientes</h2>
          {mediaError ? (
            <p className={styles.formError} role="alert">
              {mediaError} La importación manual sigue disponible en la página Día.
            </p>
          ) : media.length ? (
            <>
              <p className={styles.muted}>
                Elige qué video corresponde a cada día. Si el día no existe, se crea con la fecha
                del video.
              </p>
              <ul className={styles.list} aria-label="Videos recientes">
                {media.map((m) => {
                  const day = dayOf(m);
                  const timestamp = isoTimestamp(m.timestamp);
                  return (
                    <li key={m.id} className={styles.mediaItem}>
                      {m.thumbnail_url || m.media_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Instagram's own CDN, short-lived URLs
                        <img
                          className={styles.thumb}
                          src={m.thumbnail_url ?? m.media_url}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className={styles.thumb} />
                      )}
                      <div className={styles.mediaText}>
                        <a
                          href={m.permalink}
                          className={styles.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {m.caption?.slice(0, 80) || "Ver en Instagram"}
                        </a>
                        <small className={styles.muted}>
                          <LocalTime iso={timestamp} /> · {formatNumber(m.comments_count ?? 0)}{" "}
                          comentarios
                        </small>
                      </div>
                      {day ? (
                        <Link
                          href={`/admin?dia=${day}`}
                          className={`${styles.tag} ${styles.tagGold}`}
                        >
                          Día {day}
                        </Link>
                      ) : (
                        <ActionForm action={assignVideo} submit="Usar" variant="inline">
                          <input type="hidden" name="media_id" value={m.id} />
                          <input type="hidden" name="timestamp" value={timestamp ?? ""} />
                          <input
                            name="day"
                            type="number"
                            min={1}
                            defaultValue={nextDay}
                            aria-label="Día para este video"
                            style={{ width: 80 }}
                          />
                        </ActionForm>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className={styles.muted}>La cuenta todavía no tiene videos.</p>
          )}
        </section>
      )}
    </>
  );
}
