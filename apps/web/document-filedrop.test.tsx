import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DocumentFileDrop } from "./components/documents/DocumentFileDrop";

describe("document file drop", () => {
  it("renders selected files and existing document previews", () => {
    const html = renderToStaticMarkup(
      createElement(DocumentFileDrop, {
        files: [new File(["context"], "context.pdf", { type: "application/pdf", lastModified: 1 })],
        onFilesSelected: vi.fn(),
        existingDocuments: [
          {
            id: "doc-1",
            fileName: "existing.docx",
            sizeBytes: 2048,
            status: "ready",
          },
        ],
      })
    );

    expect(html).toContain("Subir documentos de contexto");
    expect(html).toContain("context.pdf");
    expect(html).toContain("existing.docx");
    expect(html).toContain("Listo");
    expect(html).toContain("Máximo 5 archivos");
  });
});
