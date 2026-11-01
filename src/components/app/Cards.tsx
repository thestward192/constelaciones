"use client";

import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format";
import type { StarDetails } from "@/lib/sky-api";
import type { SkyData } from "@/map/sky-data";
import { LEVEL_STYLE, toRoman } from "@/map/style";
import { invitationRewards, LEVELS, nextLevel } from "@/sky/levels";
import type { ViewerTarget } from "./Viewer3DOverlay";
import styles from "./app.module.css";

export type CardState =
  | { kind: "star"; username: string; status: "loading" | "missing" | "error" }
  | { kind: "star"; username: string; status: "ready"; details: StarDetails }
  | { kind: "sun" }
  | { kind: "planet"; name: string };

interface Props {
  card: CardState;
  data: SkyData;
  onClose: () => void;
  onUsername: (username: string) => void;
  onView3D: (target: ViewerTarget) => void;
  onPostal: (username: string) => void;
}

/** Right card on desktop, sheet from the bottom on phones: a star, the Sun or a planet. */
export default function Card({ card, data, onClose, onUsername, onView3D, onPostal }: Props) {
  return (
    <article className={styles.starCard} aria-live="polite" aria-label="Detalle">
      {card.kind === "star" ? (
        <StarBody
          card={card}
          data={data}
          onClose={onClose}
          onUsername={onUsername}
          onView3D={onView3D}
          onPostal={onPostal}
        />
      ) : card.kind === "sun" ? (
        <SunBody data={data} onClose={onClose} onView3D={onView3D} />
      ) : (
        <PlanetBody name={card.name} data={data} onClose={onClose} onView3D={onView3D} />
      )}
    </article>
  );
}

function Head({
  eyebrow,
  title,
  mono,
  children,
  onClose,
}: {
  eyebrow: string;
  title: string;
  mono?: boolean;
  children?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={styles.scHead}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h3 className={mono ? styles.scUser : styles.scTitle}>{title}</h3>
        {children}
      </div>
      <button className={styles.close} type="button" onClick={onClose} aria-label="Cerrar">
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M1 1l10 10M11 1L1 11" />
        </svg>
      </button>
    </div>
  );
}

function StarBody({
  card,
  data,
  onClose,
  onUsername,
  onView3D,
  onPostal,
}: {
  card: Extract<CardState, { kind: "star" }>;
  data: SkyData;
  onClose: () => void;
  onUsername: (u: string) => void;
  onView3D: (target: ViewerTarget) => void;
  onPostal: (username: string) => void;
}) {
  if (card.status !== "ready") {
    const message =
      card.status === "loading"
        ? "Buscando la estrella…"
        : card.status === "missing"
          ? "No hay ninguna estrella con ese nombre todavía."
          : "No se pudo cargar esta estrella. Revisa tu conexión e inténtalo de nuevo.";
    return (
      <Head eyebrow="Estrella" title={`@${card.username}`} mono onClose={onClose}>
        <p className={styles.scNote}>{message}</p>
      </Head>
    );
  }

  const d = card.details;
  const constellation = data.byId.get(d.constellation);
  const where =
    constellation?.complete && constellation.name
      ? `Constelación ${toRoman(d.constellation)} · ${constellation.name}`
      : `Constelación ${toRoman(d.constellation)} · En formación`;
  const level = LEVELS[d.level];
  const [r, g, b] = LEVEL_STYLE[d.level].color;
  const next = nextLevel(d.days);
  const rewards = invitationRewards(d.invitedCount);
  const shooting = d.shootingDays;

  return (
    <>
      <Head eyebrow="Estrella encontrada" title={`@${d.username}`} mono onClose={onClose}>
        <p className={styles.scCoord}>
          {where}
          <br />
          Estrella {String(d.slot + 1).padStart(3, "0")} de 300 · Nació el día {d.bornDay}
        </p>
      </Head>

      <div className={styles.scSection}>
        <div className={styles.scLevel}>
          <span
            className={styles.dot}
            style={{
              background: `rgb(${r},${g},${b})`,
              boxShadow: `0 0 12px rgba(${r},${g},${b},0.7)`,
            }}
          />
          <div>
            <b>{level.name}</b>
            <br />
            <span>
              {d.days} {d.days === 1 ? "día comentando" : "días comentando"}
            </span>
          </div>
        </div>
        <div className={styles.ladder} aria-hidden="true">
          {LEVELS.map((l, i) => (
            <i key={l.key} className={i <= d.level ? styles.on : undefined} />
          ))}
        </div>
        <p className={styles.scNote}>
          {next
            ? `Le ${next.daysLeft === 1 ? "falta 1 día" : `faltan ${next.daysLeft} días`} para ser ${next.level.name}.`
            : "Llegó al nivel máximo."}
        </p>
      </div>

      <div className={styles.scSection}>
        <div className={styles.kv}>
          <span>Invitada por</span>
          {d.invitedBy ? (
            <button
              type="button"
              className={styles.linkMono}
              onClick={() => onUsername(d.invitedBy!.username)}
            >
              @{d.invitedBy.username}
            </button>
          ) : (
            <b>Llegó por su cuenta</b>
          )}
        </div>
        <div className={styles.kv}>
          <span>Hilos de luz</span>
          <b>
            {rewards.rings > 0 && (
              <span className={styles.rings} aria-hidden="true">
                {Array.from({ length: rewards.rings }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
            )}
            {d.invitedCount
              ? `${formatNumber(d.invitedCount)} ${d.invitedCount === 1 ? "persona" : "personas"}`
              : "Aún nadie"}
          </b>
        </div>
        <div className={styles.kv}>
          <span>Estrella fugaz</span>
          <b>
            {!shooting.length
              ? "Aún no"
              : shooting.length === 1
                ? `Día ${shooting[0]}`
                : `${shooting.length} veces · último día ${Math.max(...shooting)}`}
          </b>
        </div>
      </div>

      <button
        className={styles.btn3d}
        type="button"
        onClick={() => onView3D({ kind: "star", details: d })}
      >
        Ver mi estrella en 3D
      </button>
      <button className={styles.btnPostal} type="button" onClick={() => onPostal(d.username)}>
        Ver postal de mi estrella
      </button>
    </>
  );
}

function SunBody({
  data,
  onClose,
  onView3D,
}: {
  data: SkyData;
  onClose: () => void;
  onView3D: (target: ViewerTarget) => void;
}) {
  const { index } = data;
  const stage = index.stages[Math.min(index.stage, index.stages.length) - 1];
  return (
    <>
      <Head eyebrow="El Sol · Centro del cielo" title="El Sol" onClose={onClose}>
        <p className={styles.scCoord}>
          Aquí nació la constelación I. El cielo crece en espiral a su alrededor.
        </p>
      </Head>
      <div className={styles.scSection}>
        <div className={styles.kv}>
          <span>Estrellas</span>
          <b className={styles.mono}>{formatNumber(index.totalStars)}</b>
        </div>
        <div className={styles.kv}>
          <span>Constelaciones</span>
          <b className={styles.mono}>{formatNumber(index.totalConstellations)}</b>
        </div>
        <div className={styles.kv}>
          <span>Día</span>
          <b className={styles.mono}>{index.day ?? 0} de 365</b>
        </div>
        <div className={styles.kv}>
          <span>Etapa</span>
          <b>
            {stage[0]} · {formatNumber(index.totalConstellations)} de {formatNumber(stage[1])}
          </b>
        </div>
      </div>
      <button
        className={styles.btn3d}
        type="button"
        onClick={() => onView3D({ kind: "sun", totalStars: index.totalStars })}
      >
        Ver el Sol en 3D
      </button>
    </>
  );
}

function PlanetBody({
  name,
  data,
  onClose,
  onView3D,
}: {
  name: string;
  data: SkyData;
  onClose: () => void;
  onView3D: (target: ViewerTarget) => void;
}) {
  const planet = data.index.planets.find((p) => p[1] === name);
  if (!planet) return <Head eyebrow="Planeta" title={name} onClose={onClose} />;
  const [, , threshold, , unlockedDay] = planet;
  const completed =
    unlockedDay !== null
      ? data.constellations.filter((c) => c.completedDay === unlockedDay).at(-1)
      : undefined;
  const missing = Math.max(0, threshold - data.index.totalStars);
  return (
    <>
      <Head
        eyebrow={unlockedDay !== null ? "Planeta" : "Planeta por aparecer"}
        title={name}
        onClose={onClose}
      >
        <p className={styles.scCoord}>Aparece al llegar a {formatNumber(threshold)} estrellas</p>
      </Head>
      <div className={styles.scSection}>
        {unlockedDay !== null ? (
          <>
            <div className={styles.kv}>
              <span>Apareció</span>
              <b className={styles.mono}>Día {unlockedDay}</b>
            </div>
            <div className={styles.kv}>
              <span>Ese día se completó</span>
              <b>{completed ? `${toRoman(completed.id)} · ${completed.name ?? ""}` : "—"}</b>
            </div>
          </>
        ) : (
          <div className={styles.kv}>
            <span>Faltan</span>
            <b className={styles.mono}>{formatNumber(missing)} estrellas</b>
          </div>
        )}
      </div>
      <button
        className={styles.btn3d}
        type="button"
        onClick={() => onView3D({ kind: "planet", name, threshold, unlockedDay })}
      >
        {unlockedDay !== null ? `Ver ${name} en 3D` : "Vista previa en 3D"}
      </button>
    </>
  );
}
