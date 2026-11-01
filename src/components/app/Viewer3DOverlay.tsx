"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import type { StarDetails } from "@/lib/sky-api";
import { LEVEL_STYLE } from "@/map/style";
import { LEVELS, nextLevel } from "@/sky/levels";
import { extrasChips, starExtras } from "@/viewer3d/params";
import type { Viewer3D, ViewerSubject } from "@/viewer3d/viewer";
import styles from "./viewer.module.css";

export type ViewerTarget =
  | { kind: "star"; details: StarDetails }
  | { kind: "sun"; totalStars: number }
  | { kind: "planet"; name: string; threshold: number; unlockedDay: number | null };

type Status = "loading" | "ready" | "unsupported" | "error";

interface Props {
  target: ViewerTarget;
  onClose: () => void;
}

/** Full-screen 3D view of a star (with its evolution bar), the Sun or a planet. */
export default function Viewer3DOverlay({ target, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const viewerRef = useRef<Viewer3D | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const ownLevel = target.kind === "star" ? target.details.level : 0;
  const [level, setLevel] = useState(ownLevel);

  const subject = useCallback(
    (shownLevel: number): ViewerSubject =>
      target.kind === "star"
        ? {
            kind: "star",
            level: shownLevel,
            extras: starExtras(target.details.invitedCount, target.details.shootingDays.length),
          }
        : target.kind === "sun"
          ? { kind: "sun" }
          : { kind: "planet", name: target.name },
    [target],
  );

  // Create the viewer (downloading three.js the first time) and free everything on close.
  useEffect(() => {
    let cancelled = false;
    let viewer: Viewer3D | null = null;
    (async () => {
      try {
        const viewerModule = await import("@/viewer3d/viewer");
        if (cancelled || !stageRef.current) return;
        try {
          viewer = viewerModule.Viewer3D.create(stageRef.current, {
            reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          });
        } catch (error) {
          setStatus(error instanceof viewerModule.WebGLUnavailableError ? "unsupported" : "error");
          return;
        }
        viewerRef.current = viewer;
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as { viewer3d?: Viewer3D }).viewer3d = viewer;
        }
        viewer.show(subject(ownLevel));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      viewer?.destroy();
      viewerRef.current = null;
    };
  }, [attempt, subject, ownLevel]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preview = (next: number) => {
    setLevel(next);
    viewerRef.current?.show(subject(next));
  };

  return (
    <section className={styles.v3d} aria-label="Vista 3D" role="dialog" aria-modal="true">
      <div ref={stageRef} className={styles.stage} />

      {status !== "ready" && (
        <div className={styles.message} role={status === "loading" ? "status" : "alert"}>
          {status === "loading" && <p>Cargando vista 3D</p>}
          {status === "unsupported" && <p>Este dispositivo no permite la vista 3D.</p>}
          {status === "error" && (
            <>
              <p>No se pudo cargar la vista 3D. Revisa tu conexión e inténtalo de nuevo.</p>
              <button
                type="button"
                onClick={() => {
                  setStatus("loading");
                  setAttempt((n) => n + 1);
                }}
              >
                Reintentar
              </button>
            </>
          )}
        </div>
      )}

      <div className={styles.top}>
        <Info target={target} level={level} />
        <button
          ref={closeRef}
          className={styles.close}
          type="button"
          onClick={onClose}
          aria-label="Cerrar vista 3D"
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1 1l10 10M11 1L1 11" />
          </svg>
        </button>
      </div>

      <div className={styles.bottom}>
        {target.kind === "star" && (
          <>
            <p className={styles.eyebrow}>Evolución de la estrella</p>
            <div className={styles.evo} role="group" aria-label="Niveles">
              {LEVELS.map((l, i) => {
                const [r, g, b] = LEVEL_STYLE[i].color;
                const classes = [
                  i === level ? styles.on : "",
                  i === ownLevel ? styles.mine : "",
                  i > ownLevel ? styles.locked : "",
                ].join(" ");
                return (
                  <button
                    key={l.key}
                    type="button"
                    className={classes}
                    aria-pressed={i === level}
                    onClick={() => preview(i)}
                  >
                    <i
                      style={{
                        background: `rgb(${r},${g},${b})`,
                        boxShadow: `0 0 10px rgba(${r},${g},${b},0.7)`,
                      }}
                    />
                    <b>{l.name}</b>
                    <small>
                      {i === ownLevel
                        ? "Tu nivel"
                        : `${l.minDays} ${l.minDays === 1 ? "día" : "días"}`}
                    </small>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <p className={styles.hint}>Arrastra para girar · rueda o pellizco para acercar</p>
      </div>
    </section>
  );
}

function Info({ target, level }: { target: ViewerTarget; level: number }) {
  if (target.kind === "sun") {
    return (
      <div className={styles.info}>
        <p className={styles.eyebrow}>El Sol en 3D</p>
        <p className={styles.level}>El Sol</p>
        <p className={styles.sub}>
          El centro del cielo, con {formatNumber(target.totalStars)} estrellas a su alrededor.
        </p>
      </div>
    );
  }
  if (target.kind === "planet") {
    return (
      <div className={styles.info}>
        <p className={styles.eyebrow}>Planeta en 3D</p>
        <p className={styles.level}>{target.name}</p>
        <p className={styles.sub}>
          {target.unlockedDay !== null
            ? `Apareció el día ${target.unlockedDay}, al llegar a ${formatNumber(target.threshold)} estrellas.`
            : `Aparecerá al llegar a ${formatNumber(target.threshold)} estrellas.`}
        </p>
        {target.unlockedDay === null && <span className={styles.previewTag}>Vista previa</span>}
      </div>
    );
  }

  const d = target.details;
  const mine = level === d.level;
  const next = nextLevel(d.days);
  const shown = LEVELS[level];
  const chips = extrasChips(d.invitedCount, d.shootingDays.length);
  const sub = mine
    ? `${d.days} ${d.days === 1 ? "día comentando" : "días comentando"}${
        next
          ? ` · ${next.daysLeft === 1 ? "falta 1 día" : `faltan ${next.daysLeft} días`} para ${next.level.name}`
          : " · nivel máximo"
      }`
    : `Así se verá tu estrella al llegar a ${shown.minDays} ${shown.minDays === 1 ? "día" : "días"} comentando.`;

  return (
    <div className={styles.info}>
      <p className={styles.eyebrow}>Tu estrella en 3D</p>
      <h2 className={styles.user}>@{d.username}</h2>
      <p className={styles.level}>{shown.name}</p>
      <p className={styles.sub}>{sub}</p>
      {!mine && <span className={styles.previewTag}>Vista previa</span>}
      {chips.length > 0 && (
        <div className={styles.chips}>
          {chips.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}
