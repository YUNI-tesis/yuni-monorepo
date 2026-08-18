"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No pudimos guardar el contexto.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(files: File[]) {
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
        await load();
      } catch (caughtError) {
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
  }

  async function remove(documentId: string) {
    await deleteDocument(documentId);
    await load();
  }

  async function retry(documentId: string) {
    await retryDocument(documentId);
    await load();
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
