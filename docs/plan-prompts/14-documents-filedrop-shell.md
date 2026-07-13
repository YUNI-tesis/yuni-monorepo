# Prompt: Context Documents Filedrop Shell

Armame un plan especifico para el shell de filedrop de documentos en la tab `Contexto` y en builder/edit.

Objetivo:
Permitir seleccionar archivos de contexto desde UI, dejando upload/ingest/provider sync real para modulos posteriores.

Debe incluir:

- componente `DocumentFileDrop`
- integracion visual en la tab `Contexto`
- integracion liviana en builder/edit cuando corresponda
- validacion frontend de tipo/tamano
- lista de archivos seleccionados
- quitar archivo
- estados visuales
- contrato futuro con documentos existentes
- copy de producto: documentos/contexto, no Knowledge Base

Reglas:

- no subir a S3 todavia
- no ingestion todavia
- no RAG todavia
- no bloquear creacion de avatar si no hay documentos
- no mostrar controles tecnicos de force-sync ni provider IDs
- los documentos son parte del contexto del avatar

Checklist:

- usuario arrastra archivos
- se muestran archivos seleccionados
- puede quitar archivos
- UI queda lista para conectar upload real y procesamiento background
