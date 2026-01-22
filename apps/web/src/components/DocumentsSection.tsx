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
    fetchDocuments();
  }, [agentId]);

  async function fetchDocuments() {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/agents/${agentId}/documents`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data: Document[] = await res.json();
      setDocuments(data);
    } catch (err: any) {
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

      // Step 2: Upload file to Azure Blob Storage
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

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Documentos</h3>
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            accept=".pdf,.txt,.docx"
            onChange={handleFileSelect}
            disabled={uploading}
          />
          <span className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {uploading ? "Subiendo..." : "Subir"}
          </span>
        </label>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>
      )}

      {loading ? (
        <div className="text-xs text-gray-600">Cargando...</div>
      ) : documents.length === 0 ? (
        <div className="text-xs text-gray-600">No hay documentos</div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${STATUS_COLORS[doc.status]}`}
                  />
                  <span className="font-medium truncate">{doc.filename}</span>
                  <span className="text-gray-500">
                    {STATUS_LABELS[doc.status]}
                  </span>
                </div>
                <div className="text-gray-500 mt-1">
                  {formatFileSize(doc.sizeBytes)} •{" "}
                  {new Date(doc.createdAt).toLocaleDateString()}
                </div>
                {doc.error && (
                  <div className="text-red-600 mt-1">{doc.error}</div>
                )}
              </div>
              <div className="flex gap-1 ml-2">
                {doc.status === "READY" && (
                  <button
                    onClick={() => handleDownload(doc.id, doc.filename)}
                    className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                  >
                    Descargar
                  </button>
                )}
                {doc.status === "UPLOADED" && (
                  <button
                    onClick={() => handleIngest(doc.id)}
                    className="px-2 py-1 text-xs bg-purple-600 text-white hover:bg-purple-700 rounded"
                  >
                    Procesar
                  </button>
                )}
                <Button
                  onClick={() => handleDelete(doc.id)}
                  variant="destructive"
                  size="sm"
                  className="text-xs"
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
