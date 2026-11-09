// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ArchitectureEvolution, connectionPath, describeDiagram } from "./ArchitectureEvolution";
import { evolutionStages } from "./evolution-content";

afterEach(cleanup);

// Section 5.1 of the thesis report ("Evolución de la arquitectura") and its Figures 6 to 12.
const REPORT_STAGES = [
  "Primer circuito de voz",
  "Conversación en tiempo real",
  "Primer conocimiento propio",
  "Primer rostro",
  "Avatar en vivo",
  "Conversación delegada y conocimiento en el proveedor",
  "Conversación grupal",
];

describe("architecture evolution content", () => {
  it("tells the same seven stages as the report, in the same order", () => {
    expect(evolutionStages.map((stage) => stage.name)).toEqual(REPORT_STAGES);
  });

  it("only connects components that exist in each stage", () => {
    for (const stage of evolutionStages) {
      const ids = stage.nodes.map((node) => node.id);
      expect(new Set(ids).size, stage.id).toBe(ids.length);
      for (const edge of stage.edges) {
        expect(ids, `${stage.id}: ${edge.from}`).toContain(edge.from);
        expect(ids, `${stage.id}: ${edge.to}`).toContain(edge.to);
      }
      for (const node of stage.nodes) {
        expect(node.row, `${stage.id}: ${node.id}`).toBeGreaterThanOrEqual(0);
        expect(node.row, `${stage.id}: ${node.id}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("retires the WebSocket server and the in-house search when the conversation is delegated", () => {
    const delegated = evolutionStages.find((stage) => stage.id === "conversacion-delegada");
    expect(delegated?.retired).toEqual(["Servidor WebSocket", "Búsqueda propia (RAG)"]);
    expect(delegated?.nodes.map((node) => node.title)).not.toContain("Servidor WebSocket");
  });

  it("describes each diagram with its lanes, connections and retired pieces", () => {
    const delegated = evolutionStages[5]!;
    const description = describeDiagram(delegated);
    expect(description).toContain("Navegador: SDK de LiveAvatar");
    expect(description).toContain("Servidores de YUNI: API (nuevo)");
    expect(description).toContain("Worker hacia ElevenLabs Agent, agente y base de conocimiento");
    expect(description).toContain("Ya no se usan: Servidor WebSocket y Búsqueda propia (RAG).");
  });

  it("draws links inside one lane as straight lines", () => {
    const [app, avatar] = evolutionStages[3]!.nodes;
    expect(connectionPath(app!, avatar!)).toBe("M 170 162.8 C 170 162.8, 170 294.8, 170 294.8");
  });
});

describe("ArchitectureEvolution", () => {
  it("lets visitors walk the seven stages with the timeline and the arrows", () => {
    render(<ArchitectureEvolution reducedMotion />);

    const milestones = screen.getAllByRole("button", { pressed: false }).concat(
      screen.getAllByRole("button", { pressed: true })
    );
    expect(milestones).toHaveLength(REPORT_STAGES.length);
    expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(REPORT_STAGES[0]);
    expect(screen.getByText("/ 07")).toBeTruthy();

    const previous = screen.getByRole("button", { name: "Etapa anterior" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Etapa siguiente" }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);

    fireEvent.click(next);
    expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(REPORT_STAGES[1]);

    fireEvent.click(screen.getByRole("button", { name: /Primer conocimiento propio/ }));
    expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(REPORT_STAGES[2]);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Búsqueda propia (nuevo)");

    fireEvent.click(screen.getByRole("button", { name: /Conversación grupal/ }));
    expect(screen.getByRole("heading", { level: 4 }).textContent).toBe(REPORT_STAGES[6]);
    expect(next.disabled).toBe(true);
  });

  it("closes with the criterion the report draws from the seven stages", () => {
    render(<ArchitectureEvolution reducedMotion />);
    expect(screen.getByText(/Pasó por siete etapas/)).toBeTruthy();
    expect(screen.getByText(/YUNI delega en proveedores especializados lo que ocurre en tiempo real/)).toBeTruthy();
  });
});
