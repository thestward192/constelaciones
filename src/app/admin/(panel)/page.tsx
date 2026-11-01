import Link from "next/link";
import { Suspense } from "react";
import { describeChallenge } from "@/lib/challenge";
import { formatNumber } from "@/lib/format";
import { toRoman } from "@/map/style";
import { lastRuns, type JobRun } from "@/server/admin/jobs";
import {
  constellationsCompletedOn,
  dayStats,
  getDay,
  listDays,
  shootingWinners,
  skyTotals,
} from "@/server/admin/queries";
import { requireAdmin } from "@/server/admin/session";
import { getInstagramToken, tokenStatus } from "@/server/instagram/token";
import { getAdminClient } from "@/server/supabase/admin";
import {
  drawShooting,
  importFromInstagram,
  importList,
  processNow,
  publishNow,
  renameConstellation,
  setChallenge,
} from "../actions";
import ActionForm from "./ActionForm";
import LocalTime from "./LocalTime";
import styles from "../admin.module.css";

const CHALLENGES = ["cantidad", "velocidad", "regreso", "invitacion", "racha", "record"];

export default function DayPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className={styles.loading}>Cargando el día</p>}>
      <DayContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DayContent({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const [totals, days] = await Promise.all([skyTotals(), listDays()]);
  const requested = Number(params.dia);
  const dayNumber =
    Number.isInteger(requested) && requested > 0 ? requested : (totals.current_day ?? days[0]?.day);

  if (!dayNumber) {
    return (
      <div className={styles.card}>
        <h2>Todavía no hay días</h2>
        <p className={styles.muted}>
          Crea el día 1 en{" "}
          <Link href="/admin/dias" className={styles.link}>
            Días
          </Link>{" "}
          para empezar.
        </p>
      </div>
    );
  }

  const [day, stats, runs, winners, completed, instagram] = await Promise.all([
    getDay(dayNumber),
    dayStats(dayNumber),
    lastRuns(getAdminClient()),
    shootingWinners(dayNumber),
    constellationsCompletedOn(dayNumber),
    getInstagramToken(getAdminClient()),
  ]);
  const instagramWarning = instagram ? tokenStatus(instagram).warning : null;
  const known = days.map((d) => d.day);
  const previous = known.filter((d) => d < dayNumber).at(0);
  const next = known.filter((d) => d > dayNumber).at(-1);

  return (
    <>
      <div className={styles.pageTitle}>
        <div>
          <p className={styles.eyebrow}>
            {day?.closed ? "Día cerrado" : "Día abierto"}
            {day?.published_at ? " · video publicado " : ""}
            {day?.published_at && <LocalTime iso={day.published_at} />}
          </p>
          <h1>Día {dayNumber}</h1>
        </div>
        <nav className={styles.dayNav} aria-label="Cambiar de día">
          {previous && <Link href={`/admin?dia=${previous}`}>← Día {previous}</Link>}
          {next && <Link href={`/admin?dia=${next}`}>Día {next} →</Link>}
        </nav>
      </div>

      {instagramWarning && (
        <div className={styles.card} style={{ marginBottom: 16 }} role="alert">
          <p className={styles.formError}>
            {instagramWarning}{" "}
            <Link href="/admin/instagram" className={styles.link}>
              Ir a Instagram
            </Link>
          </p>
        </div>
      )}

      {!day && (
        <div className={styles.card} style={{ marginBottom: 16 }}>
          <p className={styles.muted}>
            El día {dayNumber} no existe todavía. Créalo en{" "}
            <Link href="/admin/dias" className={styles.link}>
              Días
            </Link>
            .
          </p>
        </div>
      )}

      <div className={styles.stats}>
        <Stat label="Comentarios" value={stats.comments} />
        <Stat label="Sin procesar" value={stats.pending} />
        <Stat label="Estrellas nuevas" value={stats.newStars} />
        <Stat label="Regresos" value={stats.returning} />
        <Stat label="Invitaciones" value={stats.invites} />
        <Stat label="Constelaciones completas" value={stats.constellationsCompleted} />
        <Stat label="En revisión" value={stats.review} />
        <Stat label="Total de estrellas" value={totals.total_stars} />
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Importar comentarios</h2>
          {day?.ig_media_id ? (
            <>
              <p className={styles.muted}>
                Los comentarios del video se importan solos cada hora mientras el día está abierto.
                También puedes leerlos ahora.
              </p>
              <ActionForm action={importFromInstagram} submit="Importar desde Instagram">
                <input type="hidden" name="day" value={dayNumber} />
              </ActionForm>
            </>
          ) : (
            <p className={styles.muted}>
              Este día no tiene video. Asócialo en{" "}
              <Link href="/admin/instagram" className={styles.link}>
                Instagram
              </Link>{" "}
              para importar solo.
            </p>
          )}
          <p className={styles.eyebrow} style={{ marginTop: 16 }}>
            A mano
          </p>
          <p className={styles.muted}>
            Un usuario por línea y, si quieres, el comentario después de dos puntos o una coma (así
            se cuentan las invitaciones). También puedes subir un CSV. Importar dos veces la misma
            lista no duplica nada.
          </p>
          <ActionForm action={importList} submit="Importar">
            <input type="hidden" name="day" value={dayNumber} />
            <textarea
              name="list"
              aria-label="Lista de comentarios"
              placeholder={"@ana\nleo: vengan @pau"}
            />
            <input
              type="file"
              name="file"
              accept=".csv,.txt,text/csv,text/plain"
              aria-label="Archivo CSV"
            />
          </ActionForm>
        </section>

        <section className={styles.card}>
          <h2>Procesar y publicar</h2>
          <p className={styles.muted}>
            Procesar convierte los comentarios en estrellas. Publicar actualiza lo que ve la gente
            en la página.
          </p>
          <div className={styles.row}>
            <ActionForm action={processNow} submit="Procesar ahora" />
            <ActionForm action={publishNow} submit="Publicar ahora" variant="secondary" />
          </div>
          <p className={styles.runs}>
            <Run label="Último procesamiento" run={runs.process} />
            <br />
            <Run label="Última publicación" run={runs.publish} />
            <br />
            <Run label="Última importación" run={runs.import} />
          </p>
        </section>

        <section className={styles.card}>
          <h2>Reto del día</h2>
          {day?.challenge_type && day.challenge_goal ? (
            <p className={styles.muted}>
              {describeChallenge(day.challenge_type, day.challenge_goal).title}. Progreso:{" "}
              <b className={styles.mono}>
                {formatNumber(day.challenge_progress)} de {formatNumber(day.challenge_goal)}
              </b>
              {day.challenge_met === true && (
                <span className={`${styles.tag} ${styles.tagGold}`}> Cumplido</span>
              )}
            </p>
          ) : (
            <p className={styles.muted}>Este día todavía no tiene reto.</p>
          )}
          <ActionForm action={setChallenge} submit="Guardar reto">
            <input type="hidden" name="day" value={dayNumber} />
            <div className={styles.row}>
              <label className={styles.field}>
                Tipo
                <select name="type" defaultValue={day?.challenge_type ?? "cantidad"}>
                  {CHALLENGES.map((type) => (
                    <option key={type} value={type}>
                      {describeChallenge(type, 1).label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Meta
                <input
                  name="goal"
                  type="number"
                  min={1}
                  defaultValue={day?.challenge_goal ?? ""}
                  required
                />
              </label>
            </div>
          </ActionForm>
        </section>

        <section className={styles.card}>
          <h2>Estrellas fugaces</h2>
          {day?.shooting_drawn_at ? (
            <>
              <p className={styles.muted}>
                Sorteo hecho el <LocalTime iso={day.shooting_drawn_at} />. Estos son los ganadores
                para el video:
              </p>
              <ol className={styles.list} aria-label="Ganadores del sorteo">
                {winners.map((w) => (
                  <li key={w.rank}>
                    <span className={styles.mono}>
                      {w.rank}. @{w.username}
                    </span>
                    <span className={styles.tag}>Constelación {toRoman(w.constellation)}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <p className={styles.muted}>
                El sistema elige al azar entre quienes comentaron este día (ya procesados). El
                sorteo queda guardado y no se puede repetir.
              </p>
              <ActionForm
                action={drawShooting}
                submit="Sortear"
                confirm="El sorteo no se puede repetir para este día. ¿Hacerlo ahora?"
              >
                <input type="hidden" name="day" value={dayNumber} />
                <label className={styles.field}>
                  Cuántas
                  <input name="count" type="number" min={1} max={200} defaultValue={5} required />
                </label>
              </ActionForm>
            </>
          )}
        </section>

        <section className={styles.card}>
          <h2>Constelaciones completadas este día</h2>
          {completed.length ? (
            <ul className={styles.list}>
              {completed.map((c) => (
                <li key={c.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div className={styles.row} style={{ justifyContent: "space-between" }}>
                    <span>
                      <span className={styles.mono}>{toRoman(c.id)}</span> · {c.name}
                    </span>
                    <a
                      className={styles.link}
                      href={`/api/admin/constellation-image/${c.id}`}
                      download
                    >
                      Descargar imagen
                    </a>
                  </div>
                  <ActionForm action={renameConstellation} submit="Cambiar nombre" variant="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input
                      name="name"
                      defaultValue={c.name ?? ""}
                      aria-label={`Nombre de la constelación ${c.id}`}
                    />
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Ninguna todavía.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <b>{formatNumber(value)}</b>
    </div>
  );
}

function Run({ label, run }: { label: string; run?: JobRun }) {
  if (!run) return <>{label}: nunca</>;
  const status =
    run.ok === null ? "en curso" : run.ok ? "bien" : `falló (${run.error ?? "sin detalle"})`;
  return (
    <>
      {label}: <LocalTime iso={run.started_at} /> · {status}
    </>
  );
}
