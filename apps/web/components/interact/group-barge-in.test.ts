import { describe, expect, it } from "vitest";
import {
  classifyGroupHumanIntervention,
  createGroupAvatarEchoBuffer,
  GROUP_BARGE_IN_CONFIRM_MS,
  updateGroupBargeInCandidate,
} from "./group-barge-in";

describe("group human intervention classification", () => {
  it.each(["", "   ", "...", "¿?", "🎙️"])("ignores empty speech %j", (text) => {
    expect(classifyGroupHumanIntervention(text)).toBe("empty");
  });

  it.each([
    "si",
    "Sí.",
    "aja",
    "Ajá!",
    "aha",
    "ajam",
    "mhm",
    "mm",
    "mmm",
    "uhum",
    "ok",
    "okay",
    "Okey.",
    "okei",
    "oki",
    "dale",
    "claro",
    "eh",
    "sí sí",
    "ok dale",
    "Ajá, sí... claro. OKEY!",
  ])("ignores isolated or combined backchannels %j", (text) => {
    expect(classifyGroupHumanIntervention(text)).toBe("backchannel");
  });

  it.each([
    "Pará!",
    "pará, quiero cambiar de tema",
    "Para.",
    "espera",
    "Esperá un segundo",
    "basta con eso",
    "corta",
    "cortá por favor",
    "frena",
    "frená ahí",
    "detenete",
    "STOP!",
    "sí, pero...",
    "sí, pero esperá",
    "ok pero quiero preguntar algo",
    "dale pero eso no es lo que pregunté",
    "sí sí, pero no",
    "ok dale pero no",
    "Okey, pero...",
    "Para\u0301 un segundo",
  ])("cuts immediately for a leading command or disagreement %j", (text) => {
    expect(classifyGroupHumanIntervention(text)).toBe("immediate");
  });

  it.each([
    "para mí sería distinto",
    "para resolver esto hay dos opciones",
    "necesito ayuda para hacerlo",
    "la espera fue larga",
    "es una respuesta corta",
    "bastante claro",
    "claro pero falta algo",
    "otra pregunta",
    "no",
    "ok quiero cambiar la pregunta",
    "sí porque tengo una duda",
  ])("requires the candidate delay for other significant speech %j", (text) => {
    expect(classifyGroupHumanIntervention(text)).toBe("candidate");
  });
});

describe("group barge-in candidate deadline", () => {
  it("starts a fixed 300 ms deadline at the first significant candidate", () => {
    expect(updateGroupBargeInCandidate(null, "tengo", 100)).toEqual({
      text: "tengo",
      firstCandidateAt: 100,
      readyAt: 100 + GROUP_BARGE_IN_CONFIRM_MS,
    });
  });

  it("updates partials without restarting the deadline or mutating the original", () => {
    const first = updateGroupBargeInCandidate(null, "tengo", 100);
    const second = updateGroupBargeInCandidate(first, "tengo otra", 250);
    const duplicate = updateGroupBargeInCandidate(second, "tengo otra", 350);
    const final = updateGroupBargeInCandidate(duplicate, "tengo otra pregunta", 401);
    expect(first.text).toBe("tengo");
    expect(final).toEqual({ text: "tengo otra pregunta", firstCandidateAt: 100, readyAt: 400 });
  });

  it("does not share timing or text between episodes", () => {
    const first = updateGroupBargeInCandidate(null, "pregunta anterior", 0);
    const next = updateGroupBargeInCandidate(null, "pregunta nueva", 1_000);
    expect(first.readyAt).toBe(300);
    expect(next.readyAt).toBe(1_300);
  });
});

describe("ephemeral avatar generated-text echo heuristic", () => {
  it("matches normalized contiguous text, not reordered text or additions", () => {
    const echo = createGroupAvatarEchoBuffer();
    echo.add("La solución sería usar una cola única.", 10);
    expect(echo.matches("Solucion seria usar una COLA", 100)).toBe(true);
    expect(echo.matches("una cola única pero no quiero eso", 100)).toBe(false);
    expect(echo.matches("usar solución cola", 100)).toBe(false);
    expect(echo.matches("", 100)).toBe(false);
  });

  it("expires generated tokens after 2.5 seconds without extending their lifetime on lookup", () => {
    const echo = createGroupAvatarEchoBuffer();
    echo.add("una explicación", 100);
    expect(echo.matches("una explicación", 2_599)).toBe(true);
    expect(echo.matches("una explicación", 2_600)).toBe(false);
  });

  it("retains only the newest 64 tokens", () => {
    const echo = createGroupAvatarEchoBuffer();
    echo.add(Array.from({ length: 65 }, (_, index) => `palabra${index}`).join(" "), 100);
    expect(echo.matches("palabra0", 200)).toBe(false);
    expect(echo.matches("palabra1 palabra2", 200)).toBe(true);
    expect(echo.matches("palabra64", 200)).toBe(true);
    echo.add("nueva", 200);
    expect(echo.matches("palabra1", 200)).toBe(false);
    expect(echo.matches("palabra64 nueva", 200)).toBe(true);
  });

  it("expires old segments when new text arrives", () => {
    const echo = createGroupAvatarEchoBuffer();
    echo.add("vieja respuesta", 0);
    echo.add("nueva respuesta", 2_500);
    expect(echo.matches("vieja", 2_500)).toBe(false);
    expect(echo.matches("nueva", 2_500)).toBe(true);
  });

  it("isolates participants and supports clearing the buffer on teardown", () => {
    const vera = createGroupAvatarEchoBuffer();
    const bruno = createGroupAvatarEchoBuffer();
    vera.add("lo dijo Vera", 0);
    expect(bruno.matches("lo dijo Vera", 10)).toBe(false);
    vera.clear();
    expect(vera.matches("lo dijo Vera", 10)).toBe(false);
  });

  it("does not preserve tokens across a clock reset", () => {
    const echo = createGroupAvatarEchoBuffer();
    echo.add("episodio anterior", 1_000);
    expect(echo.matches("episodio anterior", 100)).toBe(false);
  });
});
