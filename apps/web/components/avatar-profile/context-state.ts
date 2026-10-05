import type { ApiAvatarContext } from "../../lib/api/avatar-api";

export function getContextIssues(context: ApiAvatarContext | null) {
  const documents = context?.documents.filter((document) => document.status === "failed").length ?? 0;
  const text = context?.textStatus === "failed";
  // Older API versions only expose an aggregate state; don't attribute it to text.
  const unknown = context?.status === "failed" && !documents && !text;
  const count = documents + Number(text) + Number(unknown);
  const title =
    documents && text
      ? "El texto y algunos documentos necesitan atención"
      : documents
        ? `${documents} ${documents === 1 ? "documento necesita" : "documentos necesitan"} atención`
        : text
          ? "El contexto textual necesita atención"
          : "El contexto necesita atención";
  return { count, title, documents, text };
}
