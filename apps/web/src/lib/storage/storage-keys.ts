/**
 * Storage key builder for documents
 */

export function buildDocumentStorageKey(
  agentId: string,
  documentId: string,
  filename: string
): string {
  // Sanitize filename: remove unsafe chars (/ \ ? % * : | " < >) and trim
  const sanitized = filename
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim();

  return `agents/${agentId}/documents/${documentId}/${sanitized}`;
}
