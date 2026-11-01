import { describe, expect, it } from "vitest";
import { extractMentions, normalizeUsername } from "@/sky/username";

describe("normalizeUsername", () => {
  it.each([
    ["@Luna_CR", "luna_cr"],
    ["  sofi.506 ", "sofi.506"],
    ["@@dani", "dani"],
    ["Ma Jo", "majo"],
    ["ＬＵＮＡ", "luna"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeUsername(raw)).toBe(expected);
  });

  it.each(["", "@", "   ", "josé", "ana-maria", "a".repeat(31), "ana@mail"])(
    "rejects %j",
    (raw) => {
      expect(normalizeUsername(raw)).toBeNull();
    },
  );
});

describe("extractMentions", () => {
  it("finds mentions in order, normalized and without duplicates", () => {
    expect(extractMentions("Vengan @Sofi y @dani_cr, @sofi también")).toEqual(["sofi", "dani_cr"]);
  });

  it("ignores emails and a trailing period", () => {
    expect(extractMentions("escriban a ana@mail.com o a @leo.")).toEqual(["leo"]);
  });

  it("keeps periods inside the name", () => {
    expect(extractMentions("@mari.vargas mira")).toEqual(["mari.vargas"]);
  });

  it("excludes the author", () => {
    expect(extractMentions("yo @Luna y @pau", "@luna")).toEqual(["pau"]);
  });

  it("returns nothing when there are no mentions", () => {
    expect(extractMentions("qué bonito")).toEqual([]);
    expect(extractMentions("@ solo")).toEqual([]);
  });
});
