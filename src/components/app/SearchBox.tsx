"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { searchStars, type SearchResult } from "@/lib/sky-api";
import { LEVELS } from "@/sky/levels";
import { toRoman } from "@/map/style";
import type { SkyData } from "@/map/sky-data";
import styles from "./app.module.css";

const DEBOUNCE_MS = 200;

interface Props {
  data: SkyData | null;
  /** Names suggested when the box is empty (my star, today's shooting stars). */
  suggestions: { username: string; note: string }[];
  onPick: (result: SearchResult | { username: string }) => void;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; results: SearchResult[] }
  | { kind: "error" };

/** "Busca tu estrella": suggestions while typing; the server finds the name among millions. */
export default function SearchBox({ data, suggestions, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  const term = query.trim().replace(/^@+/, "");

  useEffect(() => {
    if (!term) return;
    const id = ++request.current;
    const timer = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        const results = await searchStars(term);
        if (id === request.current) {
          setState({ kind: "results", results });
          setActive(0);
        }
      } catch {
        if (id === request.current) setState({ kind: "error" });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const items: { username: string; note: string; result?: SearchResult }[] = term
    ? state.kind === "results"
      ? state.results.map((r) => ({ username: r.username, note: describe(r, data), result: r }))
      : []
    : suggestions;

  const choose = (index: number) => {
    const item = items[index];
    if (!item) return;
    setQuery(item.username);
    setOpen(false);
    inputRef.current?.blur();
    onPick(item.result ?? { username: item.username });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (items.length) choose(active);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!items.length || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    setOpen(true);
    setActive((a) => (a + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
  };

  const showPanel = open && (term ? state.kind !== "idle" : suggestions.length > 0);

  return (
    <div className={styles.search}>
      <form className={styles.searchBox} role="search" onSubmit={submit}>
        <span className={styles.at} aria-hidden="true">
          @
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value.trim().replace(/^@+/, "")) setState({ kind: "idle" });
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Busca tu estrella"
          aria-label="Busca tu estrella por tu @usuario"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls="search-suggestions"
        />
        <button type="submit">Buscar</button>
      </form>

      {showPanel && (
        <div
          className={styles.suggest}
          id="search-suggestions"
          onMouseDown={(e) => e.preventDefault()}
        >
          {!term && <div className={styles.hint}>Prueba con estas estrellas</div>}
          {term && state.kind === "loading" && <div className={styles.empty}>Buscando…</div>}
          {term && state.kind === "error" && (
            <div className={styles.empty}>
              No se pudo buscar. Revisa tu conexión e inténtalo de nuevo.
            </div>
          )}
          {term && state.kind === "results" && !items.length && (
            <div className={styles.empty}>No hay ninguna estrella con ese nombre todavía.</div>
          )}
          {items.map((item, i) => (
            <button
              key={item.username}
              type="button"
              className={i === active ? styles.on : undefined}
              onClick={() => choose(i)}
            >
              <span className={styles.u}>@{item.username}</span>
              <span className={styles.c}>{item.note}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function describe(r: SearchResult, data: SkyData | null): string {
  const c = data?.byId.get(r.constellation_id);
  const where = c?.complete && c.name ? c.name : `Constelación ${toRoman(r.constellation_id)}`;
  return `${where} · ${LEVELS[r.level]?.name ?? ""}`;
}
