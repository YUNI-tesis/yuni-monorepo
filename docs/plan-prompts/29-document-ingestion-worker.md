# Prompt: Document Ingestion Worker

Armame un plan específico para ingestión async de documentos.

Objetivo:
Procesar documentos subidos, extraer texto y crear chunks.

Debe incluir:

- worker job `document_ingest`
- claim jobs
- descargar desde storage
- parse PDF/TXT/DOCX
- chunking
- crear `DocumentChunk`
- marcar ready/failed
- retry attempts

Reglas:

- worker no llama APIs HTTP internas
- descarga desde storage
- errors quedan en `Document.errorMessage` y `Job.errorMessage`

Checklist:

- job procesa documento
- chunks reemplazan los previos
- fallos quedan marcados
- retry respeta maxAttempts
