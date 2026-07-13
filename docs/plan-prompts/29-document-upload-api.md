# Prompt: Document Upload API

Armame un plan especifico para APIs de documentos.

Objetivo:
Permitir subir documentos asociados a un avatar usando S3 presigned uploads y dejarlos listos para procesamiento background.

Endpoints:

- `GET /avatars/:avatarId/documents`
- `POST /documents/presign-upload`
- `POST /documents/:documentId/confirm-upload`
- `POST /documents/:documentId/ingest`
- `DELETE /documents/:documentId`

Debe incluir:

- ownership
- validacion de mime/size
- crear `Document`
- ocultar storageKey
- enqueue de job ingest al confirmar upload
- enqueue o marca para provider sync cuando el documento este listo
- estados de producto para UI:
  - procesando
  - listo
  - no se pudo procesar

Reglas:

- no ingestion real aqui si va en worker
- no provider sync pesado en request path
- no exponer storage keys
- avatar debe pertenecer al owner
- documentos pertenecen a la tab `Contexto`
- borrar documento debe disparar cleanup/desasociacion provider en background

Checklist:

- presign upload
- confirm upload
- listar documentos
- eliminar documento propio
- confirm upload encola ingest
- no operar documento ajeno
