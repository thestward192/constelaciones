"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** A date in the viewer's own time zone (the server does not know it). */
export default function LocalTime({ iso }: { iso: string | null }) {
  const text = useSyncExternalStore(
    subscribe,
    () =>
      iso ? new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" }) : "—",
    () => (iso ? iso.slice(0, 16).replace("T", " ") : "—"),
  );
  return <time dateTime={iso ?? undefined}>{text}</time>;
}
