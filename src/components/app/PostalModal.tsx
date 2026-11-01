"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./postal.module.css";

interface Props {
  username: string;
  onClose: () => void;
}

type Status = "loading" | "ready" | "error";

/** The postcard for Instagram stories, generated on the server, ready to download. */
export default function PostalModal({ username, onClose }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const src = `/api/postal/${encodeURIComponent(username)}${attempt ? `?r=${attempt}` : ""}`;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.modal}
      role="dialog"
      aria-modal="true"
      aria-label="Postal de tu estrella"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.inner}>
        <div className={styles.frame}>
          {status !== "ready" && (
            <p className={styles.status} role={status === "error" ? "alert" : "status"}>
              {status === "loading"
                ? "Creando tu postal…"
                : "No se pudo crear la postal. Inténtalo de nuevo en un momento."}
            </p>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- generated image, already sized */}
          <img
            key={src}
            src={src}
            alt={`Postal de la estrella @${username}`}
            width={1080}
            height={1920}
            className={status === "ready" ? styles.image : styles.hiddenImage}
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
          />
        </div>
        <p className={styles.note}>
          Postal en formato historia de Instagram. Descárgala y súbela a tus historias.
        </p>
        <div className={styles.actions}>
          {status === "error" ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                setStatus("loading");
                setAttempt((n) => n + 1);
              }}
            >
              Reintentar
            </button>
          ) : (
            <a
              className={styles.primary}
              href={src}
              download={`constelaciones-${username}.png`}
              aria-disabled={status !== "ready"}
            >
              Descargar postal
            </a>
          )}
          <button ref={closeRef} type="button" className={styles.secondary} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
