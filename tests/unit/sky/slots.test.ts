import { describe, expect, it } from "vitest";
import { readFigures } from "../../../scripts/db/runner";
import { chooseFigure, varyFigure } from "@/sky/figures";
import { constellationPlacement, STARS_PER_CONSTELLATION } from "@/sky/geometry";
import { createRng } from "@/sky/random";
import { generateSlots } from "@/sky/slots";

const figures = readFigures();

function slotsFor(id: number) {
  const choice = chooseFigure(id, figures.length);
  const base = figures[choice.index];
  const figure = choice.varied ? varyFigure(base, createRng(id, "vary")) : base;
  return {
    figure,
    placement: constellationPlacement(id),
    slots: generateSlots(figure, constellationPlacement(id), id),
  };
}

describe("generateSlots", () => {
  it("is reproducible: same seed, same slots", () => {
    expect(slotsFor(7).slots).toEqual(slotsFor(7).slots);
    expect(slotsFor(7).slots).not.toEqual(slotsFor(8).slots);
  });

  it.each(figures.map((f, i) => [f.slug, i + 1] as const))(
    "%s: 300 slots with every anchor once, inside the constellation disc",
    (_, id) => {
      const { figure, placement, slots } = slotsFor(id);
      expect(slots).toHaveLength(STARS_PER_CONSTELLATION);
      expect(slots.map((s) => s.slotIndex)).toEqual([...Array(STARS_PER_CONSTELLATION).keys()]);

      const anchorIndexes = slots.filter((s) => s.isAnchor).map((s) => s.anchorIndex);
      expect([...anchorIndexes].sort((a, b) => a! - b!)).toEqual([...figure.anchors.keys()]);

      for (const s of slots) {
        expect(Math.hypot(s.x - placement.x, s.y - placement.y)).toBeLessThanOrEqual(
          placement.scale + 0.01,
        );
      }
    },
  );

  it("shuffles anchors through the fill order so the figure appears little by little", () => {
    const { slots } = slotsFor(1);
    const firstAnchors = slots.slice(0, 13).filter((s) => s.isAnchor).length;
    expect(firstAnchors).toBeLessThan(13);
  });

  it("keeps stars from sitting on top of each other", () => {
    const { slots, placement } = slotsFor(3);
    let close = 0;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        if (Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y) < placement.scale * 0.008)
          close++;
      }
    }
    expect(close).toBe(0);
  });
});

describe("figure choice", () => {
  it("uses each handmade figure once, then reuses them with variations", () => {
    const n = figures.length;
    expect([...Array(n).keys()].map((i) => chooseFigure(i + 1, n).index)).toEqual([
      ...Array(n).keys(),
    ]);
    const later = chooseFigure(n + 1, n);
    expect(later.varied).toBe(true);
    expect(later.index).toBeLessThan(n);
    expect(chooseFigure(500, n)).toEqual(chooseFigure(500, n));
  });

  it("varies a reused figure without changing its edges", () => {
    const base = figures[0];
    const varied = varyFigure(base, createRng(99, "vary"));
    expect(varied.edges).toEqual(base.edges);
    expect(varied.anchors).toHaveLength(base.anchors.length);
    expect(varied.anchors).not.toEqual(base.anchors);
  });
});
