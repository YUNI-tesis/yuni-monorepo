import { describe, expect, it } from "vitest";
import { MAX_DOCUMENT_BYTES, validateDocumentFiles } from "./components/context/DocumentFileDrop";

function file(name: string, size: number, lastModified = 1) {
  return { name, size, lastModified, type: "" } as File;
}

describe("document file drop", () => {
  it("accepts every supported extension and removes exact duplicates", () => {
    const pdf = file("manual.pdf", 10);
    const result = validateDocumentFiles([
      pdf,
      pdf,
      file("notes.md", 20),
      file("guide.docx", 30),
      file("page.html", 40),
      file("book.epub", 50),
      file("plain.txt", 60),
    ]);

    expect(result.error).toBeNull();
    expect(result.files).toHaveLength(6);
  });

  it("rejects unsupported, empty, and oversized files without dropping valid ones", () => {
    const result = validateDocumentFiles([
      file("image.png", 10),
      file("empty.txt", 0),
      file("huge.pdf", MAX_DOCUMENT_BYTES + 1),
      file("valid.pdf", 100),
    ]);

    expect(result.error).toContain("Formato no soportado");
    expect(result.files.map((item) => item.name)).toEqual(["valid.pdf"]);
  });
});
