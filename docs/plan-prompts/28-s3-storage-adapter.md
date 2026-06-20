# Prompt: S3 Storage Adapter

Armame un plan especifico para storage en S3.

Objetivo:
Implementar storage provider principal para documentos de contexto del avatar.

Debe incluir:

- `packages/storage`
- interface `ObjectStorage`
- `S3ObjectStorage`
- `LocalObjectStorage` solo dev/test
- presigned upload/download
- exists
- delete
- download buffer
- tests con mocks

Reglas:

- S3 es storage principal
- no Azure
- storage keys no se exponen publicamente
- presigned URLs expiran
- documentos almacenados se muestran como `Contexto` en UI
- sync provider o RAG no vive en storage; storage solo provee archivos para jobs posteriores

Checklist:

- genera upload URL
- genera download URL server-side
- delete funciona
- local adapter util para tests
- no filtra storage keys a frontend/publico
