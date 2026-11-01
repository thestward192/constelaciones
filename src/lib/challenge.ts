import { formatNumber } from "./format";

// How each daily challenge is told on the page (docs/constelaciones.md, section 6).

const TEXTS: Record<string, { label: string; title: (goal: number) => string; unlock: string }> = {
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
    title: (g) => `Que ${formatNumber(g)} personas lleguen a Estrella amarilla`,
    unlock: "una lluvia de estrellas",
  },
  record: {
    label: "Récord",
    title: () => "Superar el récord de estrellas nuevas en un día",
    unlock: "una nebulosa de un color único",
  },
};

export function describeChallenge(type: string, goal: number) {
  const text = TEXTS[type] ?? {
    label: type,
    title: () => `Meta: ${formatNumber(goal)}`,
    unlock: "algo nuevo en el cielo",
  };
  return { label: text.label, title: text.title(goal), unlock: text.unlock };
}
