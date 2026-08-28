// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ArchitectureSystem } from "./ArchitectureSystem";

afterEach(cleanup);

describe("ArchitectureSystem interactions", () => {
  it("clears a hovered module as soon as the pointer leaves that module", () => {
    render(<ArchitectureSystem reducedMotion />);

    const user = screen.getByRole("button", { name: /Usuario/ });
    const readout = document.querySelector('[aria-live="polite"]');
    const controlTrack = document.querySelector('[data-track-id="user-web"]');
    const groupTrack = document.querySelector('[data-track-id="core-orchestrator"]');

    expect(readout?.textContent).toContain("Un recorrido coordinado");

    fireEvent.pointerEnter(user);

    expect(user.getAttribute("aria-expanded")).toBe("true");
    expect(readout?.textContent).toContain("Punto de entrada");
    expect(controlTrack?.getAttribute("data-muted")).toBeNull();
    expect(groupTrack?.getAttribute("data-muted")).toBe("true");

    fireEvent.pointerLeave(user);

    expect(user.getAttribute("aria-expanded")).toBe("false");
    expect(readout?.textContent).toContain("Un recorrido coordinado");
    expect(groupTrack?.getAttribute("data-muted")).toBeNull();
  });

  it("offers the same explanation lifecycle to keyboard focus", () => {
    render(<ArchitectureSystem reducedMotion />);

    const core = screen.getByRole("button", { name: /Núcleo YUNI/ });
    const readout = document.querySelector('[aria-live="polite"]');

    fireEvent.focus(core);
    expect(readout?.textContent).toContain("API");
    expect(readout?.textContent).not.toContain("Hono");
    expect(core.getAttribute("aria-expanded")).toBe("true");

    fireEvent.blur(core);
    expect(readout?.textContent).toContain("Un recorrido coordinado");
    expect(core.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps every connection on the two projected circuit axes", () => {
    render(<ArchitectureSystem reducedMotion />);

    const routes = Array.from(document.querySelectorAll<SVGGElement>("[data-grid-route]"));
    const ports = document.querySelectorAll("[data-node-port]");

    expect(routes).toHaveLength(6);
    expect(routes.map((route) => route.dataset.trackId)).toEqual([
      "user-web",
      "web-core",
      "core-data",
      "core-live",
      "core-orchestrator",
      "orchestrator-live",
    ]);
    expect(ports).toHaveLength(6);

    const routeEndpoints = new Set<string>();
    const renderedSegments = new Set<string>();
    const circuitSegments: Array<{
      routeId: string;
      start: number[];
      end: number[];
      axis: "u" | "v";
    }> = [];

    for (const route of routes) {
      const points = (route.dataset.gridRoute ?? "").split("|").map((point) => point.split(":").map(Number));

      const firstPoint = points[0];
      const lastPoint = points.at(-1);
      if (firstPoint) routeEndpoints.add(`${firstPoint[0]}:${firstPoint[1]}`);
      if (lastPoint) routeEndpoints.add(`${lastPoint[0]}:${lastPoint[1]}`);

      for (let index = 1; index < points.length; index += 1) {
        const previousPoint = points[index - 1];
        const point = points[index];
        expect(previousPoint !== undefined && point !== undefined).toBe(true);
        expect(previousPoint?.[0] === point?.[0] || previousPoint?.[1] === point?.[1]).toBe(true);

        if (previousPoint && point) {
          circuitSegments.push({
            routeId: route.dataset.trackId ?? "unknown",
            start: previousPoint,
            end: point,
            axis: previousPoint[0] === point[0] ? "v" : "u",
          });

          const endpoints = [`${previousPoint[0]}:${previousPoint[1]}`, `${point[0]}:${point[1]}`].sort();
          const segment = endpoints.join("|");
          expect(renderedSegments.has(segment)).toBe(false);
          renderedSegments.add(segment);
        }
      }
    }

    const isBetween = (value: number, start: number, end: number) =>
      value >= Math.min(start, end) && value <= Math.max(start, end);
    const isEndpoint = (segment: (typeof circuitSegments)[number], point: readonly number[]) =>
      (segment.start[0] === point[0] && segment.start[1] === point[1]) ||
      (segment.end[0] === point[0] && segment.end[1] === point[1]);

    for (let firstIndex = 0; firstIndex < circuitSegments.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < circuitSegments.length; secondIndex += 1) {
        const first = circuitSegments[firstIndex];
        const second = circuitSegments[secondIndex];
        if (!first || !second || first.routeId === second.routeId) continue;

        if (first.axis === second.axis) {
          const firstFixed = first.axis === "u" ? first.start[1] : first.start[0];
          const secondFixed = second.axis === "u" ? second.start[1] : second.start[0];
          if (firstFixed !== secondFixed) continue;

          const firstRange =
            first.axis === "u"
              ? ([first.start[0] ?? 0, first.end[0] ?? 0] as const)
              : ([first.start[1] ?? 0, first.end[1] ?? 0] as const);
          const secondRange =
            second.axis === "u"
              ? ([second.start[0] ?? 0, second.end[0] ?? 0] as const)
              : ([second.start[1] ?? 0, second.end[1] ?? 0] as const);
          const overlapStart = Math.max(
            Math.min(firstRange[0], firstRange[1]),
            Math.min(secondRange[0], secondRange[1])
          );
          const overlapEnd = Math.min(
            Math.max(firstRange[0], firstRange[1]),
            Math.max(secondRange[0], secondRange[1])
          );

          expect(overlapEnd - overlapStart).toBeLessThanOrEqual(0);
          continue;
        }

        const horizontal = first.axis === "u" ? first : second;
        const vertical = first.axis === "v" ? first : second;
        const intersection = [vertical.start[0] ?? 0, horizontal.start[1] ?? 0] as const;
        const intersects =
          isBetween(intersection[0], horizontal.start[0] ?? 0, horizontal.end[0] ?? 0) &&
          isBetween(intersection[1], vertical.start[1] ?? 0, vertical.end[1] ?? 0);

        if (intersects) {
          expect(isEndpoint(horizontal, intersection) && isEndpoint(vertical, intersection)).toBe(true);
        }
      }
    }

    for (const port of ports) {
      expect(routeEndpoints.has(port.getAttribute("data-port-grid") ?? "")).toBe(true);
    }
  });

  it("shows the simplified real architecture without the removed concept", () => {
    const { container } = render(<ArchitectureSystem reducedMotion />);

    expect(screen.queryByRole("button", { name: /^Contexto\b/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Orquestador grupal/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Núcleo YUNI/ }).querySelector("small")?.textContent).toBe(
      "API"
    );
    const liveNode = screen.getByRole("button", { name: /Conversación en vivo/ });
    expect(liveNode.textContent).toContain("ElevenLabs Agent + LiveAvatar");
    expect(liveNode.textContent).toMatch(/voz/i);
    expect(liveNode.textContent).toMatch(/rostro/i);
    expect(liveNode.textContent).toMatch(/video/i);
    expect(container.textContent).not.toContain("Knowledge Base");
    expect(container.textContent).not.toMatch(/presencia/i);
  });
});
