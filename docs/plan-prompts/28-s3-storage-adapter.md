# Prompt: S3 Storage Adapter

Armame un plan específico para storage en S3.

Objetivo:
Implementar storage provider principal para documentos.

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
- storage keys no se exponen públicamente
- presigned URLs expiran

Checklist:

- genera upload URL
- genera download URL
- delete funciona
- local adapter útil para tests
