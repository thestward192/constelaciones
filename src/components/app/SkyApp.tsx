"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import SkyView from "@/components/sky/SkyView";
import { starDetails, type SearchResult } from "@/lib/sky-api";
import type { MapPick, SkyMap } from "@/map/sky-map";
import type { ConstellationInfo, SkyData } from "@/map/sky-data";
import { normalizeUsername } from "@/sky/username";
import Card, { type CardState } from "./Cards";
import SearchBox from "./SearchBox";
import SidePanel from "./SidePanel";
import TopBar from "./TopBar";
import styles from "./app.module.css";

const MY_STAR_KEY = "constelaciones:mi-estrella";
const MOBILE = "(max-width: 860px)";

function readMyStar(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(MY_STAR_KEY);
  } catch {
    return null;
  }
}

function saveMyStar(username: string) {
  try {
    localStorage.setItem(MY_STAR_KEY, username);
  } catch {
    // Private mode: the shortcut simply will not appear.
  }
}

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const isMobile = () => window.matchMedia(MOBILE).matches;

/** /@usuario links: the username in the path, if any. */
function handleFromPath(): string | null {
  const path = decodeURIComponent(window.location.pathname);
  return path.startsWith("/@") ? normalizeUsername(path.slice(2)) : null;
}

/** The public page: map, top bar, search, panel, cards and shortcuts. */
export default function SkyApp() {
  const mapRef = useRef<SkyMap | null>(null);
  const [data, setData] = useState<SkyData | null>(null);
  const [card, setCard] = useState<CardState | null>(null);
  // Only shown once the sky has loaded, so reading storage here cannot mismatch the server render.
  const [myStar, setMyStar] = useState<string | null>(readMyStar);
  const request = useRef(0);

  const mobile = useSyncExternalStore(subscribeMobile, isMobile, () => false);

  // Keep what is searched visible: panels cover parts of the screen.
  const cardOpen = useRef(false);
  useEffect(() => {
    cardOpen.current = card !== null;
  }, [card]);
  const insets = useCallback(() => {
    if (window.matchMedia(MOBILE).matches) {
      return {
        top: 120,
        right: 0,
        left: 0,
        bottom: cardOpen.current ? Math.round(window.innerHeight * 0.55) : 76,
      };
    }
    return { top: 130, right: cardOpen.current ? 380 : 0, bottom: 20, left: 360 };
  }, []);

  /** Opens a star: travels to it (if asked), marks it, then fetches its card and threads. */
  const openStar = useCallback(
    async (
      username: string,
      options: {
        travel: boolean;
        remember?: boolean;
        known?: { x: number; y: number; constellationId: number; level: number };
      },
    ) => {
      const id = ++request.current;
      const map = mapRef.current;
      cardOpen.current = true; // before focusing: the card takes part of the screen
      setCard({ kind: "star", username, status: "loading" });
      window.history.replaceState(null, "", `/@${username}`);
      if (options.known) {
        map?.select({ ...options.known, threads: [] }, options.known.constellationId);
        if (options.travel) map?.focusOn(options.known.x, options.known.y);
      }
      try {
        const details = await starDetails(username);
        if (id !== request.current) return;
        if (!details) {
          setCard({ kind: "star", username, status: "missing" });
          map?.select(null);
          return;
        }
        setCard({ kind: "star", username: details.username, status: "ready", details });
        const threads = [...(details.invitedBy ? [details.invitedBy] : []), ...details.invited];
        map?.select(
          { x: details.x, y: details.y, level: details.level, threads },
          details.constellation,
        );
        if (options.travel && !options.known) map?.focusOn(details.x, details.y);
        if (options.remember) {
          saveMyStar(details.username);
          setMyStar(details.username);
        }
      } catch {
        if (id === request.current) setCard({ kind: "star", username, status: "error" });
      }
    },
    [],
  );

  const closeCard = useCallback(() => {
    request.current++;
    cardOpen.current = false;
    setCard(null);
    mapRef.current?.select(null);
    window.history.replaceState(null, "", "/");
  }, []);

  const onReady = useCallback(
    (sky: SkyData) => {
      setData(sky);
      const handle = handleFromPath();
      if (handle) void openStar(handle, { travel: true });
    },
    [openStar],
  );

  const onPick = useCallback(
    (pick: MapPick) => {
      if (pick.kind === "star") {
        void openStar(pick.username, {
          travel: false,
          known: { x: pick.x, y: pick.y, constellationId: pick.constellationId, level: pick.level },
        });
      } else if (pick.kind === "sun" || pick.kind === "planet") {
        request.current++;
        mapRef.current?.select(null);
        window.history.replaceState(null, "", "/");
        setCard(pick.kind === "sun" ? { kind: "sun" } : { kind: "planet", name: pick.name });
      } else if (card) {
        closeCard();
      }
    },
    [openStar, closeCard, card],
  );

  const onSearchPick = useCallback(
    (result: SearchResult | { username: string }) => {
      const known =
        "x" in result
          ? {
              x: result.x,
              y: result.y,
              constellationId: result.constellation_id,
              level: result.level,
            }
          : undefined;
      void openStar(result.username, { travel: true, remember: true, known });
    },
    [openStar],
  );

  const flyToConstellation = useCallback((c: ConstellationInfo) => {
    mapRef.current?.focusOn(c.x, c.y, Math.min(1.2, 300 / c.r));
  }, []);

  const suggestions = [
    ...(myStar ? [{ username: myStar, note: "Mi estrella" }] : []),
    ...(data?.index.shooting ?? [])
      .filter((name) => name !== myStar)
      .slice(0, 5)
      .map((username) => ({ username, note: "Estrella fugaz de hoy" })),
  ];

  return (
    <div className={styles.app}>
      <SkyView
        onMap={(map) => (mapRef.current = map)}
        onReady={onReady}
        onPick={onPick}
        insets={insets}
        hideCorner={mobile && card !== null}
        hideMinimap={card !== null}
        actions={
          data && (
            <>
              <button type="button" onClick={() => mapRef.current?.fitAll()}>
                Ver todo
              </button>
              <button type="button" onClick={() => mapRef.current?.flyToToday()}>
                Hoy
              </button>
              {myStar && (
                <button type="button" onClick={() => void openStar(myStar, { travel: true })}>
                  Mi estrella
                </button>
              )}
            </>
          )
        }
      />
      <TopBar index={data?.index ?? null} onHome={() => mapRef.current?.fitAll()} />
      {data && <SearchBox data={data} suggestions={suggestions} onPick={onSearchPick} />}
      {data && (
        <SidePanel
          data={data}
          onConstellation={flyToConstellation}
          onUsername={(username) => void openStar(username, { travel: true })}
        />
      )}
      {data && card && (
        <Card
          card={card}
          data={data}
          onClose={closeCard}
          onUsername={(username) => void openStar(username, { travel: true })}
        />
      )}
    </div>
  );
}
