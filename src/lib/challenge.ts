import { LEVELS } from "../sky/levels";
import { formatNumber } from "./format";

// How each daily challenge is told on the page (docs/constelaciones.md, section 6).

const TEXTS: Record<
  string,
  { label: string; title: (goal: number, level: string) => string; unlock: string }
> = {
  cantidad: {
    label: "Cantidad",
    title: (g) => `Hoy formemos ${formatNumber(g)} ${g === 1 ? "constelación" : "constelaciones"}`,
    unlock: "una aurora boreal sobre las constelaciones del día",
  },
  velocidad: {
    label: "Velocidad",
    title: (g) => `${formatNumber(g)} estrellas en la primera hora`,
    unlock: "un cometa que cruza el cielo",
  },
  regreso: {
    label: "Regreso",
    title: (g) => `${formatNumber(g)} personas que vuelvan a comentar hoy`,
    unlock: "luna llena esta noche",
  },
  invitacion: {
    label: "Invitación",
    title: (g) => `${formatNumber(g)} hilos de luz en un día`,
    unlock: "borde dorado para las estrellas que inviten hoy",
  },
  racha: {
    label: "Racha",
    title: (g, level) => `Que ${formatNumber(g)} personas lleguen a ${level}`,
    unlock: "una lluvia de estrellas",
  },
  record: {
    label: "Récord",
    title: () => "Superar el récord de estrellas nuevas en un día",
    unlock: "una nebulosa de un color único",
  },
};

/** Texts of a challenge. `level` is the level a "racha" asks for (2 = Estrella amarilla). */
export function describeChallenge(type: string, goal: number, level = 2) {
  const text = TEXTS[type] ?? {
    label: type,
    title: () => `Meta: ${formatNumber(goal)}`,
    unlock: "algo nuevo en el cielo",
  };
  const levelName = (LEVELS[level] ?? LEVELS[2]).name;
  return { label: text.label, title: text.title(goal, levelName), unlock: text.unlock };
}
