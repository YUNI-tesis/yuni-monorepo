# Prompt: Documents Filedrop Shell

Armame un plan específico para el shell de filedrop de documentos en builder/edit.

Objetivo:
Permitir seleccionar archivos de contexto desde UI, dejando upload/ingest real para módulos posteriores.

Debe incluir:

- componente `DocumentFileDrop`
- validación frontend de tipo/tamaño
- lista de archivos seleccionados
- quitar archivo
- estados visuales
- contrato futuro con documentos existentes

Reglas:

- no subir a S3 todavía
- no ingestión todavía
- no RAG todavía
- no bloquear creación de avatar si no hay documentos

Checklist:

- usuario arrastra archivos
- se muestran archivos seleccionados
- puede quitar archivos
- UI queda lista para conectar upload real
