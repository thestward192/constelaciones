import { describe, expect, it } from "vitest";
import { parseCommentList } from "@/server/admin/comment-list";
import { pickWinners } from "@/server/admin/draw";
import { adminEmails, isAdminEmail } from "@/server/admin/emails";

describe("admin emails", () => {
  it("reads a comma separated list, ignoring case and spaces", () => {
    expect(adminEmails(" Ana@Mail.com, leo@mail.com ,")).toEqual(["ana@mail.com", "leo@mail.com"]);
    expect(isAdminEmail("ANA@mail.com ", ["ana@mail.com"])).toBe(true);
    expect(isAdminEmail("otra@mail.com", ["ana@mail.com"])).toBe(false);
    expect(isAdminEmail("ana@mail.com", [])).toBe(false);
  });
});

describe("pickWinners", () => {
  it("picks the requested number of different candidates", () => {
    const candidates = Array.from({ length: 50 }, (_, i) => i);
    const winners = pickWinners(candidates, 10);
    expect(winners).toHaveLength(10);
    expect(new Set(winners).size).toBe(10);
    expect(winners.every((w) => candidates.includes(w))).toBe(true);
  });

  it("never asks for more winners than candidates", () => {
    expect(pickWinners([1, 2, 3], 10).sort()).toEqual([1, 2, 3]);
  });

  it("gives every candidate the same chance", () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8000; i++) counts[pickWinners([0, 1, 2, 3], 1)[0]]++;
    for (const c of counts) expect(c / 8000).toBeGreaterThan(0.22);
  });
});

describe("parseCommentList", () => {
  it("reads one username per line, with an optional comment", () => {
    expect(parseCommentList("@ana\nleo: miren esto @pau\n\n  mia , hola  ")).toEqual([
      { username: "@ana" },
      { username: "leo", text: "miren esto @pau" },
      { username: "mia", text: "hola" },
    ]);
  });

  it("reads a CSV with a header and quoted comments", () => {
    const csv = 'usuario,comentario\r\nana,"hola, @leo"\r\n"leo",""\r\npau;sin comillas';
    expect(parseCommentList(csv)).toEqual([
      { username: "ana", text: "hola, @leo" },
      { username: "leo" },
      { username: "pau", text: "sin comillas" },
    ]);
  });

  it("keeps a username that looks like a header only on later lines", () => {
    expect(parseCommentList("ana\nusuario")).toEqual([
      { username: "ana" },
      { username: "usuario" },
    ]);
  });
});
