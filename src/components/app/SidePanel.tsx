"use client";

import { useState } from "react";
import { describeChallenge } from "@/lib/challenge";
import { formatNumber } from "@/lib/format";
import type { ConstellationInfo, SkyData } from "@/map/sky-data";
import { LEVEL_STYLE, toRoman } from "@/map/style";
import { LEVELS } from "@/sky/levels";
import styles from "./app.module.css";

interface Props {
  data: SkyData;
  onConstellation: (c: ConstellationInfo) => void;
  onUsername: (username: string) => void;
}

/**
 * Left panel (a folding bottom bar on phones): today's constellation, the next one, the
 * challenge of the day, today's shooting stars and the star levels.
 */
export default function SidePanel({ data, onConstellation, onUsername }: Props) {
  const [open, setOpen] = useState(false);
  const { index } = data;
  const todayList = data.constellations.filter(
    (c) => index.day !== null && c.completedDay === index.day,
  );
  const featured = todayList.at(-1) ?? data.constellations.filter((c) => c.complete).at(-1) ?? null;
  const forming = data.constellations.find((c) => !c.complete) ?? null;
  const challenge = index.challenge
    ? { ...index.challenge, ...describeChallenge(index.challenge.type, index.challenge.goal) }
    : null;

  const summary = featured?.name ?? (forming ? `Constelación ${toRoman(forming.id)}` : "");
  const pick = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <aside className={`${styles.side} ${open ? styles.open : ""}`} aria-label="Resumen del día">
      <button
        type="button"
        className={styles.toggleSide}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          {todayList.length ? "Constelación de hoy" : "Última constelación"}
          {summary ? ` · ${summary}` : ""}
        </span>
        {challenge && (
          <small>
            Reto {formatNumber(challenge.progress)}/{formatNumber(challenge.goal)}
          </small>
        )}
      </button>

      {featured && (
        <section className={styles.card}>
          <p className={styles.eyebrow}>
            {todayList.length ? "Constelación de hoy" : "Última constelación"}
          </p>
          <button
            type="button"
            className={styles.cardLink}
            onClick={() => pick(() => onConstellation(featured))}
          >
            <h2 className={styles.cname}>
              <small>{toRoman(featured.id)}</small>
              {featured.name}
            </h2>
          </button>
          <div className={styles.meta}>
            <div>
              <span>Completada</span>
              <b>Día {featured.completedDay}</b>
            </div>
            <div>
              <span>Estrellas</span>
              <b>{featured.count}</b>
            </div>
            <div>
              <span>Hoy</span>
              <b>{todayList.length}</b>
            </div>
          </div>
          {forming && (
            <>
              <div className={styles.progressRow}>
                <span>Próxima constelación</span>
                <b>{forming.count} de 300</b>
              </div>
              <div className={`${styles.bar} ${styles.wide}`}>
                <i style={{ width: `${(forming.count / 300) * 100}%` }} />
              </div>
            </>
          )}
        </section>
      )}

      {challenge && (
        <section className={styles.card}>
          <p className={styles.eyebrow}>Reto del día · {challenge.label}</p>
          <p className={styles.retoTitle}>{challenge.title}</p>
          <div className={styles.progressRow}>
            <span>Progreso</span>
            <b>
              {formatNumber(challenge.progress)} de {formatNumber(challenge.goal)}
            </b>
          </div>
          <div className={`${styles.bar} ${styles.wide}`}>
            <i
              style={{ width: `${Math.min(100, (challenge.progress / challenge.goal) * 100)}%` }}
            />
          </div>
          <p className={styles.retoUnlock}>
            {challenge.met ? "Cumplido: " : "Si se cumple: "}
            <em>{challenge.unlock}</em>
          </p>
        </section>
      )}

      <section className={styles.card}>
        <p className={styles.eyebrow}>Estrellas fugaces de hoy</p>
        {index.shooting.length ? (
          <ul className={styles.fugaces}>
            {index.shooting.map((name) => (
              <li key={name}>
                <button type="button" onClick={() => pick(() => onUsername(name))}>
                  <span className={styles.trail} />
                  <span className={styles.u}>@{name}</span>
                  <span className={styles.go}>Ver</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>Hoy todavía no hay estrellas fugaces.</p>
        )}
      </section>

      <section className={styles.card}>
        <p className={styles.eyebrow}>Niveles de estrella</p>
        <div className={styles.legend}>
          {LEVELS.map((level, i) => {
            const [r, g, b] = LEVEL_STYLE[i].color;
            const size = Math.round(4 + LEVEL_STYLE[i].r * 2);
            return (
              <div key={level.key}>
                <i
                  style={{
                    width: size,
                    height: size,
                    background: `rgb(${r},${g},${b})`,
                    boxShadow: `0 0 ${size}px rgba(${r},${g},${b},0.6)`,
                  }}
                />
                {level.name}
                <small>{level.minDays}d</small>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
