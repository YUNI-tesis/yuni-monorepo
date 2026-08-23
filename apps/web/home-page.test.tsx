import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./app/page";

describe("public home page", () => {
  it("renders the thesis narrative and links visitors to the demo", () => {
    const html = renderToStaticMarkup(createElement(HomePage));

    expect(html).toContain("La IA deja de");
    expect(html).toContain("Se convierte en presencia");
    expect(html).toContain("Conversar no alcanza");
    expect(html).toContain("De una idea");
    expect(html).toContain("Una experiencia humana");
    expect(html).toContain("Dos autores.");
    expect(html).toContain("Una pregunta.");
    expect(html).toContain("¿Qué hace que una IA se sienta viva?");
    expect(html).toContain("YUNI fue nuestra forma de responderla");
    expect(html).toContain("Universidad Austral");
    expect(html).toContain("Facultad de Ingeniería");
    expect(html).toContain("Ingeniería Informática");
    expect(html).toContain("Trabajo final de grado");
    expect(html).toContain("Una plataforma.");
    expect(html).toContain("Muchas formas de conectar.");
    expect(html).toContain("Identidad configurable");
    expect(html).toContain("Voz en tiempo real");
    expect(html).toContain("Avatar en vivo");
    expect(html).toContain("Contexto documental");
    expect(html).toContain("Compartir con control");
    expect(html).toContain("Actividad y transcripciones");
    expect(html).toContain("Conversaciones grupales");
    expect(html).toContain("Privacidad y límites");
    expect(html).not.toContain("Costos visibles");
    expect(html).toContain("<span>Creá.</span>");
    expect(html).toContain("<span>Comprendé.</span>");
    expect(html).toContain("Lucas");
    expect(html).toContain("Santiago");
    expect(html).not.toContain("Autor 01");
    expect(html).not.toContain("Autor 02");
    expect(html).not.toContain("sistemas distribuidos");
    expect(html).toContain('href="#experiencia"');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('data-draggable="true"');
  });
});
