"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/fetch-client";
import { Button } from "@/components/common";

interface Document {
  id: string;
  agentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: "PENDING" | "UPLOADING" | "UPLOADED" | "INGESTING" | "READY" | "FAILED";
  error: string | null;
  summaryStatus: "PENDING" | "UPLOADING" | "UPLOADED" | "INGESTING" | "READY" | "FAILED" | null;
  summaryError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DocumentsSectionProps {
  agentId: string;
}

const STATUS_COLORS: Record<Document["status"], string> = {
  PENDING: "bg-gray-500",
  UPLOADING: "bg-blue-500",
  UPLOADED: "bg-yellow-500",
  INGESTING: "bg-purple-500",
  READY: "bg-green-500",
  FAILED: "bg-red-500",
};

const STATUS_LABELS: Record<Document["status"], string> = {
  PENDING: "Pendiente",
  UPLOADING: "Subiendo",
  UPLOADED: "Subido",
  INGESTING: "Procesando",
  READY: "Listo",
  FAILED: "Error",
};

export function DocumentsSection({ agentId }: DocumentsSectionProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("[DocumentsSection] Mounting with agentId:", agentId);
    fetchDocuments();
  }, [agentId]);

  async function fetchDocuments() {
    try {
      setLoading(true);
      console.log("[DocumentsSection] Fetching documents for agent:", agentId);
      const res = await fetchWithAuth(`/api/agents/${agentId}/documents`);
      console.log("[DocumentsSection] Response status:", res.status);
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data: Document[] = await res.json();
      console.log("[DocumentsSection] Documents loaded:", data.length);
      setDocuments(data);
    } catch (err: any) {
      console.error("[DocumentsSection] Error fetching documents:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      setError(`Tipo de archivo no permitido: ${file.type}`);
      return;
    }

    // Validate file size (default 20MB)
    const maxSizeMB = 20;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`El archivo excede el tamaño máximo de ${maxSizeMB}MB`);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Step 1: Get presigned URL
      const presignRes = await fetchWithAuth("/api/documents/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });

      if (!presignRes.ok) {
        const data = await presignRes.json();
        throw new Error(data.error || "Failed to get upload URL");
      }

      const { document, upload } = await presignRes.json();

      // Step 2: Upload file to S3 Storage
      const uploadRes = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to storage");
      }

      // Step 3: Confirm upload
      const confirmRes = await fetchWithAuth("/api/documents/confirm-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: document.id }),
      });

      if (!confirmRes.ok) {
        const data = await confirmRes.json();
        throw new Error(data.error || "Failed to confirm upload");
      }

      // Refresh documents list
      await fetchDocuments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = "";
    }
  }

  async function handleDownload(documentId: string, filename: string) {
    try {
      const res = await fetchWithAuth(`/api/documents/${documentId}/download`);
      if (!res.ok) throw new Error("Failed to get download URL");
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(documentId: string) {
    if (!confirm("¿Estás seguro de que quieres eliminar este documento?")) {
      return;
    }

    try {
      const res = await fetchWithAuth(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete document");
      await fetchDocuments();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleIngest(documentId: string) {
    try {
      const res = await fetchWithAuth(`/api/documents/${documentId}/ingest`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to ingest document");
      }
      // Refresh to show updated status
      await fetchDocuments();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleSummarize(documentId: string) {
    try {
      const res = await fetchWithAuth(`/api/documents/${documentId}/summarize`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to summarize document");
      }
      // Refresh to show updated status
      await fetchDocuments();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">Documentos</h3>
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            accept=".pdf,.txt,.docx,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
            disabled={uploading}
          />
          <span className="px-3 py-1 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
            {uploading ? "Subiendo..." : "Subir"}
          </span>
        </label>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 p-2 rounded-lg mb-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-white/60">Cargando...</div>
      ) : documents.length === 0 ? (
        <div className="text-xs text-white/40">No hay documentos aún</div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start gap-2 p-3 bg-white/5 rounded-lg border border-white/10 text-xs"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[doc.status]}`}
                  />
                  <span className="font-medium truncate text-white">{doc.filename}</span>
                </div>
                <div className="text-white/40 text-[10px] space-y-0.5">
                  <div>
                    {STATUS_LABELS[doc.status]} • {formatFileSize(doc.sizeBytes)}
                  </div>
                  {doc.summaryStatus && (
                    <div>
                      Resumen: {STATUS_LABELS[doc.summaryStatus]}
                    </div>
                  )}
                </div>
                {doc.error && (
                  <div className="text-red-400 text-[10px] mt-1">⚠️ {doc.error}</div>
                )}
                {doc.summaryError && (
                  <div className="text-red-400 text-[10px] mt-1">⚠️ Resumen: {doc.summaryError}</div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {doc.status === "READY" && (
                  <>
                    <button
                      onClick={() => handleDownload(doc.id, doc.filename)}
                      className="px-2 py-1 text-[10px] bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                    >
                      ⬇ Descargar
                    </button>
                    {(!doc.summaryStatus || doc.summaryStatus === "FAILED") && (
                      <button
                        onClick={() => handleSummarize(doc.id)}
                        className="px-2 py-1 text-[10px] bg-blue-600/80 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        📝 Resumir
                      </button>
                    )}
                  </>
                )}
                {doc.status === "UPLOADED" && (
                  <button
                    onClick={() => handleIngest(doc.id)}
                    className="px-2 py-1 text-[10px] bg-purple-600/80 hover:bg-purple-600 text-white rounded transition-colors"
                  >
                    ⚙️ Procesar
                  </button>
                )}
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="px-2 py-1 text-[10px] bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
                >
                  🗑️ Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
