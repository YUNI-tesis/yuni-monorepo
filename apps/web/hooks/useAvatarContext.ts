"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@yuni/ui";
import {
  deleteDocument,
  getAvatarContext,
  retryDocument,
  updateAvatarContext,
  uploadAvatarDocument,
  type ApiAvatarContext,
} from "../lib/api/avatar-api";

export type LocalDocumentUpload = {
  key: string;
  fileName: string;
  progress: number;
  status: "uploading" | "confirmed" | "failed";
  error?: string;
};

export function useAvatarContext(avatarId: string) {
  const toast = useToast();
  const [context, setContext] = useState<ApiAvatarContext | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploads, setUploads] = useState<LocalDocumentUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const initializedText = useRef(false);

  const load = useCallback(async () => {
    try {
      const result = await getAvatarContext(avatarId);
      setContext(result.context);
      if (!initializedText.current) {
        setText(result.context.text);
        initializedText.current = true;
      }
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No pudimos cargar el contexto.");
    } finally {
      setLoading(false);
    }
  }, [avatarId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!context || context.status !== "processing") return;
    const timer = window.setInterval(() => void load(), 3_000);
    return () => window.clearInterval(timer);
  }, [context?.status, load]);

  async function saveText() {
    setSaving(true);
    try {
      const result = await updateAvatarContext(avatarId, text.trim());
      setContext(result.context);
      setError(null);
      toast.success("El nuevo contexto se está preparando para las próximas conversaciones.", {
        title: "Contexto guardado",
        dedupeKey: `avatar:${avatarId}:context:saved`,
      });
    } catch (caughtError) {
      toast.error(actionError(caughtError, "Intentá nuevamente."), {
        title: "No pudimos guardar el contexto",
        dedupeKey: `avatar:${avatarId}:context:error`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function upload(files: File[]) {
    let succeeded = 0;
    let failed = 0;

    for (const file of files) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      setUploads((current) => [
        ...current.filter((upload) => upload.key !== key),
        { key, fileName: file.name, progress: 0, status: "uploading" },
      ]);
      try {
        await uploadAvatarDocument(avatarId, file, (progress) => {
          setUploads((current) =>
            current.map((upload) => (upload.key === key ? { ...upload, progress } : upload))
          );
        });
        setUploads((current) =>
          current.map((upload) =>
            upload.key === key ? { ...upload, progress: 100, status: "confirmed" } : upload
          )
        );
        succeeded += 1;
      } catch (caughtError) {
        failed += 1;
        setUploads((current) =>
          current.map((upload) =>
            upload.key === key
              ? {
                  ...upload,
                  status: "failed",
                  error: caughtError instanceof Error ? caughtError.message : "Error al subir.",
                }
              : upload
          )
        );
      }
    }

    if (succeeded > 0) await load();

    if (failed === 0 && succeeded > 0) {
      toast.success(
        succeeded === 1 ? "El documento se está procesando." : `${succeeded} documentos se están procesando.`,
        {
          title: succeeded === 1 ? "Documento subido" : "Documentos subidos",
          dedupeKey: `avatar:${avatarId}:documents:upload`,
        }
      );
    } else if (succeeded > 0) {
      toast.warning(`Se subieron ${succeeded} y fallaron ${failed}. Revisá el detalle de cada archivo.`, {
        title: "Algunos documentos no se subieron",
        dedupeKey: `avatar:${avatarId}:documents:upload`,
      });
    } else if (failed > 0) {
      toast.error("Revisá el detalle de cada archivo e intentá nuevamente.", {
        title: "No pudimos subir los documentos",
        dedupeKey: `avatar:${avatarId}:documents:upload`,
      });
    }
  }

  async function remove(documentId: string, fileName: string) {
    try {
      await deleteDocument(documentId);
      await load();
      toast.success(`${fileName} fue eliminado del contexto.`, {
        title: "Documento eliminado",
        dedupeKey: `document:${documentId}:deleted`,
      });
    } catch (caughtError) {
      toast.error(actionError(caughtError, "Intentá nuevamente."), {
        title: "No pudimos eliminar el documento",
        dedupeKey: `document:${documentId}:delete:error`,
      });
    }
  }

  async function retry(documentId: string, fileName: string) {
    try {
      await retryDocument(documentId);
      await load();
      toast.success(`${fileName} volvió a la cola de procesamiento.`, {
        title: "Procesamiento reintentado",
        dedupeKey: `document:${documentId}:retried`,
      });
    } catch (caughtError) {
      toast.error(actionError(caughtError, "Intentá nuevamente."), {
        title: "No pudimos reintentar el documento",
        dedupeKey: `document:${documentId}:retry:error`,
      });
    }
  }

  return {
    context,
    text,
    setText,
    loading,
    saving,
    uploads,
    error,
    saveText,
    upload,
    remove,
    retry,
    reload: load,
  };
}

function actionError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
