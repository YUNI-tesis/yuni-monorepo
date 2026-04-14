"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Trash, Menu } from "iconsax-react";
import { fetchWithAuth } from "@/lib/fetch-client";

const MAX_SIZE_MB = 20;
const ALLOWED_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPT_ATTR = ".pdf,.txt,.docx";

export interface ContextDocument {
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

interface AgentContextSectionProps {
  agentId?: string;
  readOnly?: boolean;
  contextText?: string;
  onContextTextChange?: (value: string) => void;
  /** When true, use editor styles (glass, larger). When false, use sidebar styles. */
  variant?: "editor" | "sidebar";
}

const STATUS_COLORS: Record<ContextDocument["status"], string> = {
  PENDING: "bg-gray-500",
  UPLOADING: "bg-blue-500",
  UPLOADED: "bg-yellow-500",
  INGESTING: "bg-purple-500",
  READY: "bg-green-500",
  FAILED: "bg-red-500",
};

const STATUS_LABELS: Record<ContextDocument["status"], string> = {
  PENDING: "Pendiente",
  UPLOADING: "Subiendo",
  UPLOADED: "Subido",
  INGESTING: "Procesando",
  READY: "Listo",
  FAILED: "Error",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Tipo no permitido: ${file.name}. Usa PDF, TXT o DOCX.`;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `${file.name} excede ${MAX_SIZE_MB} MB`;
  }
  return null;
}

export function AgentContextSection({
  agentId,
  readOnly = false,
  contextText = "",
  onContextTextChange,
  variant = "sidebar",
}: AgentContextSectionProps) {
  const [documents, setDocuments] = useState<ContextDocument[]>([]);
  const [loading, setLoading] = useState(!!agentId);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [autoProcessingIds, setAutoProcessingIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    if (!agentId) return;
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/agents/${agentId}/documents`);
      if (!res.ok) throw new Error("Error al cargar documentos");
      const data: ContextDocument[] = await res.json();
      console.log('[AgentContextSection] Documents loaded:', data.map(d => ({ id: d.id, filename: d.filename, status: d.status })));
      setDocuments(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (agentId) fetchDocuments();
    else setDocuments([]);
  }, [agentId, fetchDocuments]);

  /** Returns documentId on success for auto-ingest. */
  async function uploadOneFile(file: File): Promise<string> {
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
      throw new Error(data.error || "Error al obtener URL de subida");
    }
    const { document: doc, upload } = await presignRes.json();
    const uploadRes = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: file,
    });
    if (!uploadRes.ok) throw new Error("Error al subir el archivo");
    const confirmRes = await fetchWithAuth("/api/documents/confirm-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: doc.id }),
    });
    if (!confirmRes.ok) {
      const data = await confirmRes.json();
      throw new Error(data.error || "Error al confirmar subida");
    }
    return doc.id;
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !agentId) return;
    const fileArray = Array.from(files);
    const errors: string[] = [];
    for (const file of fileArray) {
      const err = validateFile(file);
      if (err) {
        errors.push(err);
      }
    }
    if (errors.length) {
      setError(errors.join(". "));
      return;
    }
    setError(null);
    setUploading(true);
    const validFiles = fileArray.filter((f) => !validateFile(f));
    const uploadedIds: string[] = [];
    
    // Upload all files first
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setUploadProgress(`Subiendo ${i + 1}/${validFiles.length}: ${file.name}`);
      try {
        const documentId = await uploadOneFile(file);
        uploadedIds.push(documentId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al subir";
        console.error(`Upload failed for ${file.name}:`, msg);
        setError(`Error al subir ${file.name}: ${msg}`);
        // Continue with next file
      }
    }
    
    // Refresh to show uploaded documents
    await fetchDocuments();
    
    // Mark these documents as auto-processing
    setAutoProcessingIds(new Set(uploadedIds));
    
    // Auto-process each uploaded document (fire and forget, don't block UI)
    for (let i = 0; i < uploadedIds.length; i++) {
      const docId = uploadedIds[i];
      setUploadProgress(`Procesando ${i + 1}/${uploadedIds.length}...`);
      // Fire and forget - let it process in background
      fetchWithAuth(`/api/documents/${docId}/ingest`, { method: "POST" })
        .then(() => {
          fetchDocuments();
          // Remove from auto-processing set once done
          setAutoProcessingIds(prev => {
            const next = new Set(prev);
            next.delete(docId);
            return next;
          });
        })
        .catch(err => {
          console.error(`Ingest error for document ${docId}:`, err);
          fetchDocuments(); // Refresh to show error state
          // Remove from auto-processing set even on error
          setAutoProcessingIds(prev => {
            const next = new Set(prev);
            next.delete(docId);
            return next;
          });
        });
      // Small delay between starting each ingest
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    setUploadProgress(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (agentId && !readOnly && !uploading) setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!agentId || readOnly || uploading) return;
    handleFiles(e.dataTransfer.files);
  }

  function handleView(documentId: string) {
    fetchWithAuth(`/api/documents/${documentId}/download`)
      .then((res) => {
        if (!res.ok) throw new Error("Error al obtener enlace");
        return res.json();
      })
      .then(({ url }) => window.open(url, "_blank"))
      .catch((err) => setError(err instanceof Error ? err.message : "Error"));
  }

  async function handleDelete(documentId: string) {
    if (!confirm("¿Eliminar este documento?")) return;
    try {
      const res = await fetchWithAuth(`/api/documents/${documentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleIngest(documentId: string) {
    try {
      const res = await fetchWithAuth(`/api/documents/${documentId}/ingest`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al procesar");
      }
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }


  const isEditor = variant === "editor";
  const containerClass = isEditor
    ? "space-y-4"
    : "space-y-3";
  const inputClass = isEditor
    ? "w-full px-4 py-3 glass rounded-xl border border-theme text-theme placeholder:text-muted-theme focus:outline-none focus-visible:border-[var(--color-focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] bg-surface text-sm resize-none min-h-[80px]"
    : "w-full px-3 py-2 rounded-lg border border-theme text-theme placeholder:text-muted-theme focus:outline-none focus:border-[var(--color-accent)] bg-surface text-xs resize-none min-h-[60px]";

  return (
    <div className={containerClass}>
      <h3 className={`font-semibold text-foreground flex items-center gap-2 ${isEditor ? "text-base" : "text-sm"}`}>
        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Contexto (base de conocimiento)
      </h3>

      {/* 1. Archivos: drop zone + list (priority) */}
      <div className="space-y-3">
        {agentId && !readOnly ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Arrastra archivos o haz clic para seleccionar"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`
              border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer
              ${dragOver ? "border-purple-500 bg-purple-500/10" : "border-theme-strong bg-surface hover:bg-surface-hover"}
              ${uploading ? "pointer-events-none opacity-80" : ""}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={ACCEPT_ATTR}
              multiple
              disabled={uploading}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {uploading && uploadProgress ? (
              <p className="text-sm text-muted-strong-theme">{uploadProgress}</p>
            ) : (
              <>
                <p className="text-sm text-muted-strong-theme mb-1">Arrastra archivos aquí o haz clic para seleccionar</p>
                <p className="text-xs text-muted-theme">PDF, TXT, DOCX. Máx. {MAX_SIZE_MB} MB por archivo.</p>
              </>
            )}
          </div>
        ) : !agentId && !readOnly ? (
          <div className="border border-dashed border-theme-strong rounded-xl p-4 bg-surface text-center">
            <p className="text-sm text-muted-foreground">Podrás agregar archivos después de crear el agente.</p>
            <p className="text-xs text-muted-theme mt-1">El contexto se basa principalmente en los documentos que subas.</p>
          </div>
        ) : null}

        {error && (
          <div className="text-xs text-error-theme bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg" role="alert">
            {error}
          </div>
        )}

        {agentId && (
          <>
            {loading ? (
              <p className="text-xs text-muted-theme">Cargando documentos...</p>
            ) : documents.length === 0 ? (
              <p className="text-xs text-muted-theme">Aún no hay archivos. Arrastra o selecciona archivos arriba.</p>
            ) : (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-start gap-2 p-3 bg-surface rounded-lg border border-theme"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[doc.status]}`} />
                        <span className="font-medium text-foreground text-sm truncate">{doc.filename}</span>
                      </div>
                      <div className="text-muted-theme text-xs mt-0.5">
                        {STATUS_LABELS[doc.status]} · {formatFileSize(doc.sizeBytes)}
                        {doc.summaryStatus != null && ` · Resumen: ${STATUS_LABELS[doc.summaryStatus]}`}
                      </div>
                      {(doc.error || doc.summaryError) && (
                        <p className="text-error-theme text-xs mt-1">
                          {doc.error || doc.summaryError}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 flex-shrink-0">
                      {/* Loading indicator for auto-processing or ingesting */}
                      {(autoProcessingIds.has(doc.id) || doc.status === "INGESTING") && (
                        <span className="px-3 py-1.5 text-xs text-purple-300 flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Procesando...
                        </span>
                      )}
                      
                      {/* Process button - only for uploaded (NOT auto-processing) or failed */}
                      {((doc.status === "UPLOADED" && !autoProcessingIds.has(doc.id)) || doc.status === "FAILED") && variant === "editor" && (
                        <button
                          type="button"
                          onClick={() => handleIngest(doc.id)}
                          className="px-3 py-1.5 text-xs bg-purple-600/80 hover:bg-purple-600 text-white rounded transition-colors"
                        >
                          {doc.status === "FAILED" ? "Reintentar" : "Procesar"}
                        </button>
                      )}
                      
                      {/* EDITOR MODE: Show inline buttons */}
                      {variant === "editor" && (doc.status === "READY" || (doc.status === "UPLOADED" && !autoProcessingIds.has(doc.id))) && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleView(doc.id)}
                            className="px-3 py-1.5 text-xs bg-purple-600/80 hover:bg-purple-600 text-white rounded transition-colors font-medium"
                            aria-label={`Ver ${doc.filename}`}
                          >
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(doc.id)}
                            className="px-3 py-1.5 text-xs bg-red-600/60 hover:bg-red-600 text-white rounded transition-colors flex items-center gap-1"
                            aria-label={`Eliminar ${doc.filename}`}
                          >
                            <Trash size={16} />
                            Eliminar
                          </button>
                        </>
                      )}
                      
                      {/* SIDEBAR MODE: Three-dot menu */}
                      {variant === "sidebar" && (doc.status === "READY" || (doc.status === "UPLOADED" && !autoProcessingIds.has(doc.id)) || doc.status === "FAILED") && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)}
                            className="p-1.5 text-muted-foreground hover:text-theme hover:bg-surface-hover rounded transition-colors"
                            aria-label="Opciones"
                          >
                            <Menu size={20} color="white"/>
                          </button>
                          
                          {openMenuId === doc.id && (
                            <>
                              {/* Backdrop to close menu */}
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenMenuId(null)}
                              />
                              
                              {/* Dropdown menu */}
                              <div className="absolute right-0 top-full mt-1 bg-background border border-theme-strong rounded-lg shadow-xl z-20 min-w-[140px] py-1">
                                {(doc.status === "READY" || (doc.status === "UPLOADED" && !autoProcessingIds.has(doc.id))) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleView(doc.id);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-surface-hover transition-colors"
                                  >
                                    Ver documento
                                  </button>
                                )}
                                {(doc.status === "FAILED" || (doc.status === "UPLOADED" && !autoProcessingIds.has(doc.id))) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleIngest(doc.id);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-surface-hover transition-colors"
                                  >
                                    {doc.status === "FAILED" ? "Reintentar" : "Procesar"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDelete(doc.id);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-error-theme hover:bg-red-500/20 transition-colors"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* 2. Notas adicionales (opcional) */}
      <div>
        <label className={`block font-medium text-muted-strong-theme mb-1 ${isEditor ? "text-sm" : "text-xs"}`}>
          Notas adicionales (opcional)
        </label>
        {readOnly ? (
          <div className={`rounded-lg border border-theme bg-surface p-3 text-muted-foreground whitespace-pre-wrap ${isEditor ? "text-sm" : "text-xs"} max-h-32 overflow-y-auto`}>
            {contextText || "—"}
          </div>
        ) : (
          <textarea
            value={contextText}
            onChange={(e) => onContextTextChange?.(e.target.value)}
            placeholder="Texto complementario al contexto de los archivos..."
            className={inputClass}
            rows={3}
          />
        )}
      </div>
    </div>
  );
}
