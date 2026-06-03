import { describe, expect, it } from "vitest";
import {
  formatDocumentFileSize,
  maxDocumentFileSizeBytes,
  maxDocumentFiles,
  validateDocumentFiles,
} from "./lib/document-files";

describe("document files", () => {
  it("accepts supported document files", () => {
    const files = [
      createFile("context.pdf", 1024, "application/pdf"),
      createFile("notes.txt", 1024, "text/plain"),
      createFile("legacy.doc", 1024, "application/msword"),
      createFile("guide.docx", 1024, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ];

    expect(validateDocumentFiles([], files)).toEqual({
      acceptedFiles: files,
      rejections: [],
    });
  });

  it("rejects unsupported file extensions", () => {
    const file = createFile("image.png", 1024, "image/png");

    expect(validateDocumentFiles([], [file]).rejections).toMatchObject([
      {
        file,
        reason: "unsupported-type",
      },
    ]);
  });

  it("rejects files larger than the maximum size", () => {
    const file = createFile("huge.pdf", maxDocumentFileSizeBytes + 1, "application/pdf");

    expect(validateDocumentFiles([], [file]).rejections).toMatchObject([
      {
        file,
        reason: "file-too-large",
      },
    ]);
  });

  it("rejects files above the maximum count", () => {
    const existingFiles = Array.from({ length: maxDocumentFiles }, (_, index) =>
      createFile(`context-${index}.pdf`, 1024, "application/pdf", index)
    );
    const extraFile = createFile("extra.pdf", 1024, "application/pdf");

    expect(validateDocumentFiles(existingFiles, [extraFile]).rejections).toMatchObject([
      {
        file: extraFile,
        reason: "too-many-files",
      },
    ]);
  });

  it("deduplicates repeated files", () => {
    const file = createFile("context.pdf", 1024, "application/pdf", 42);

    expect(validateDocumentFiles([file], [file])).toMatchObject({
      acceptedFiles: [file],
      rejections: [
        {
          file,
          reason: "duplicate",
        },
      ],
    });
  });

  it("formats document sizes", () => {
    expect(formatDocumentFileSize(512)).toBe("512 B");
    expect(formatDocumentFileSize(1536)).toBe("1.5 KB");
    expect(formatDocumentFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

function createFile(name: string, size: number, type: string, lastModified = 1): File {
  return new File([new Uint8Array(size)], name, { type, lastModified });
}
