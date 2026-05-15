# Prompt: Document Upload API

Armame un plan específico para APIs de documentos.

Objetivo:
Permitir subir documentos asociados a un avatar usando S3 presigned uploads.

Endpoints:

- `GET /avatars/:avatarId/documents`
- `POST /documents/presign-upload`
- `POST /documents/:documentId/confirm-upload`
- `POST /documents/:documentId/ingest`
- `DELETE /documents/:documentId`

Debe incluir:

- ownership
- validación de mime/size
- crear `Document`
- ocultar storageKey
- enqueue de job ingest

Reglas:

- no ingestión real aquí si va en worker
- no exponer storage keys
- avatar debe pertenecer al owner

Checklist:

- presign upload
- confirm upload
- listar documentos
- eliminar documento propio
- no operar documento ajeno
