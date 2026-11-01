import { describe, expect, it } from "vitest";
import { describeChallenge } from "@/lib/challenge";

describe("describeChallenge", () => {
  it("tells each type with its goal and unlock", () => {
    expect(describeChallenge("cantidad", 1).title).toBe("Hoy formemos 1 constelación");
    expect(describeChallenge("cantidad", 5).title).toBe("Hoy formemos 5 constelaciones");
    expect(describeChallenge("velocidad", 1300).title).toBe("1.300 estrellas en la primera hora");
    expect(describeChallenge("invitacion", 500).unlock).toMatch(/borde dorado/);
  });

  it("names the level a racha asks for", () => {
    expect(describeChallenge("racha", 200).title).toBe(
      "Que 200 personas lleguen a Estrella amarilla",
    );
    expect(describeChallenge("racha", 50, 3).title).toBe("Que 50 personas lleguen a Gigante azul");
  });

  it("does not break with an unknown type", () => {
    expect(describeChallenge("otro", 3).title).toBe("Meta: 3");
  });
});
