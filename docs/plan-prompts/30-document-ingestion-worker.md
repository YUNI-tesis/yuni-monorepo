# Prompt: Document Ingestion Worker

Armame un plan especifico para ingestion async de documentos.

Objetivo:
Procesar documentos subidos, extraer texto, crear chunks y disparar actualizacion de contexto/provider cuando corresponda.

Debe incluir:

- worker job `document_ingest`
- claim jobs
- descargar desde storage
- parse PDF/TXT/DOCX
- chunking
- crear `DocumentChunk`
- marcar ready/failed
- retry attempts con backoff
- enqueue de job de provider context sync despues de ingestion exitosa

Reglas:

- worker no llama APIs HTTP internas
- descarga desde storage
- errors quedan en `Document.errorMessage` y `Job.errorMessage`
- no bloquear el avatar si falla ingestion
- UI normal no muestra detalles tecnicos, solo estado de contexto/documento

Checklist:

- job procesa documento
- chunks reemplazan los previos
- fallos quedan marcados
- retry respeta maxAttempts
- ingestion exitosa deja el contexto listo para sync background
