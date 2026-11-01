"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Insets, MapPick, SkyMap } from "@/map/sky-map";
import type { SkyData } from "@/map/sky-data";
import type { ZoomLevel } from "@/map/zoom-levels";
import { skyFilesBaseUrl } from "@/lib/sky-files-url";
import styles from "./SkyView.module.css";

const INDICATOR: { level: ZoomLevel; label: string }[] = [
  { level: "universe", label: "Universo" },
  { level: "region", label: "Región" },
  { level: "constellation", label: "Constelación" },
  { level: "star", label: "Estrella" },
];

type Status = "loading" | "ready" | "error";

/** Where the sky files come from. In development, ?sky=/dev-sky points to the fake sky. */
function filesUrl(): string {
  if (process.env.NODE_ENV !== "production") {
    const override = new URLSearchParams(window.location.search).get("sky");
    if (override) return override.replace(/\/$/, "");
  }
  return skyFilesBaseUrl();
}

interface Props {
  onMap?: (map: SkyMap | null) => void;
  onReady?: (data: SkyData) => void;
  onPick?: (pick: MapPick) => void;
  /** Screen space covered by panels, so focusing keeps things visible. */
  insets?: () => Insets;
  /** Extra buttons under the zoom controls (shortcuts). */
  actions?: ReactNode;
  /** Hide the corner controls (a bottom sheet covers them on phones). */
  hideCorner?: boolean;
  /** Hide only the minimap (a card covers it on desktop). */
  hideMinimap?: boolean;
}

/** The sky map with its corner: minimap, zoom level, zoom buttons and shortcuts. */
export default function SkyView({
  onMap,
  onReady,
  onPick,
  insets,
  actions,
  hideCorner,
  hideMinimap,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<SkyMap | null>(null);
  const callbacks = useRef({ onMap, onReady, onPick, insets });
  const [status, setStatus] = useState<Status>("loading");
  const [level, setLevel] = useState<ZoomLevel>("constellation");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    callbacks.current = { onMap, onReady, onPick, insets };
  });

  useEffect(() => {
    let cancelled = false;
    let map: SkyMap | null = null;
    (async () => {
      // PixiJS is only downloaded in the browser, with the map.
      const { SkyMap } = await import("@/map/sky-map");
      if (cancelled || !hostRef.current) return;
      map = await SkyMap.create(hostRef.current, {
        baseUrl: filesUrl(),
        minimap: minimapRef.current,
        onCamera: (_, next) => setLevel(next),
        onReady: (data, instance) => {
          mapRef.current = instance;
          callbacks.current.onMap?.(instance);
          setStatus("ready");
          callbacks.current.onReady?.(data);
        },
        onError: () => setStatus("error"),
        onPick: (pick) => callbacks.current.onPick?.(pick),
        insets: () => callbacks.current.insets?.() ?? { top: 0, right: 0, bottom: 0, left: 0 },
      });
      if (cancelled) {
        map.destroy();
        return;
      }
      mapRef.current = map;
      callbacks.current.onMap?.(map);
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { skyMap?: SkyMap }).skyMap = map;
      }
    })().catch(() => setStatus("error"));
    return () => {
      cancelled = true;
      map?.destroy();
      mapRef.current = null;
      callbacks.current.onMap?.(null);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  const shown = level === "name" ? "star" : level;

  return (
    <div className={styles.root}>
      <div ref={hostRef} className={styles.canvas} />

      {status === "loading" && <p className={styles.loading}>Cargando el cielo</p>}
      {status === "error" && (
        <div className={styles.error} role="alert">
          <p>No se pudo cargar el cielo. Revisa tu conexión e inténtalo de nuevo.</p>
          <button type="button" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}

      <div className={styles.corner} hidden={status !== "ready" || hideCorner}>
        <canvas
          ref={minimapRef}
          className={styles.minimap}
          hidden={hideMinimap}
          aria-label="Minimapa. Toca para viajar a ese lugar."
        />
        <ol className={styles.levels} aria-label="Nivel de acercamiento">
          {INDICATOR.map(({ level: l, label }) => (
            <li key={l} aria-current={shown === l ? "step" : undefined}>
              {label}
            </li>
          ))}
        </ol>
        <div className={styles.controls}>
          <div className={styles.zoom}>
            <button type="button" aria-label="Acercar" onClick={() => mapRef.current?.zoomBy(1.8)}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Alejar"
              onClick={() => mapRef.current?.zoomBy(1 / 1.8)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h10" />
              </svg>
            </button>
          </div>
          {actions}
        </div>
      </div>
    </div>
  );
}
