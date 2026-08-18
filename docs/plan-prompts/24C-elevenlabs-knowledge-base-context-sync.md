# Prompt: ElevenLabs Knowledge Base Background Context Sync

Estado: implementado el 2026-08-17. Refactorizado conceptualmente el 2026-06-19 por `0009-product-navigation-sharing-background-sync.md`.

## Implementacion resultante

- YUNI/PostgreSQL + S3-compatible storage son la fuente de verdad; ElevenLabs es una proyeccion reconstruible.
- El texto corto se crea como documento `text` y se asocia con `usage_mode: "prompt"`.
- Los archivos se suben como documento `file`, se indexan con `multilingual_e5_large_instruct` y se asocian con `usage_mode: "auto"`.
- El prompt conserva el texto inline durante la migracion y lo retira solo cuando el documento textual ya es utilizable.
- Los jobs efectivos son `avatar_context_provider_sync`, `document_provider_sync`, `agent_provider_sync`, `provider_document_cleanup` y `avatar_provider_cleanup`.
- Los endpoints privados efectivos son `GET/PATCH /avatars/:avatarId/context`, presign/confirm, retry y delete de documentos.
- `DocumentChunk` queda reservado para el RAG propio; este MVP entrega el archivo original a ElevenLabs.
- La version provider anterior sigue disponible mediante `providerLastUsableAt` mientras una nueva proyeccion se procesa o falla.

## Objetivo

Integrar el contexto del creador con ElevenLabs Knowledge Base para que el Agent usado por LiveAvatar LITE pueda responder usando documentos y texto cargados en YUNI.

YUNI sigue siendo la fuente de verdad. ElevenLabs Knowledge Base es una copia derivada para mejorar la experiencia conversacional del MVP ElevenLabs-first. Este plan no reemplaza el RAG propio de YUNI definido en `31-rag-retriever-integration.md`.

## Dependencias

- Requiere `24B-elevenlabs-agent-provider-sync.md`, porque el Agent de ElevenLabs ya debe existir o poder crearse en background.
- Para contexto textual del avatar, puede implementarse sin esperar documentos reales.
- Para documentos subidos por el creador, requiere `28-s3-storage-adapter.md` y `29-document-upload-api.md`.
- `30-document-ingestion-worker.md` es opcional si se sube el archivo original a ElevenLabs; es necesario si YUNI extrae texto y sincroniza documentos textuales.
- `31-rag-retriever-integration.md` puede avanzar despues o en paralelo, pero no bloquea este MVP provider-first.

## Alcance MVP

- Sincronizar `AvatarAgent.context` como documento de texto en ElevenLabs Knowledge Base.
- Sincronizar documentos confirmados de YUNI hacia ElevenLabs Knowledge Base.
- Asociar Knowledge Base document IDs al ElevenLabs Agent del avatar.
- Mantener la llamada privada LiveAvatar LITE + ElevenLabs Connector funcionando con `pcm_24000`.
- Mostrar estados de producto para contexto/documentos solo cuando sean relevantes.
- Reintentar automaticamente los fallos transitorios.
- No exponer API keys, storage keys ni payloads crudos del provider al frontend.

Fuera de alcance:

- RAG propio de YUNI.
- Multiagente.
- Creacion o clonacion de voces.
- Edicion avanzada de chunks dentro de ElevenLabs.
- Botones de sync como flujo principal del usuario.

## Diseno De Producto

El creador debe poder:

1. Crear o editar un avatar.
2. Escribir instrucciones y contexto textual.
3. Subir documentos asociados al avatar.
4. Ver documentos en la tab `Contexto`.
5. Ver estados simples: `Listo`, `Procesando` o `No se pudo actualizar`.
6. Iniciar una llamada aunque parte del contexto este fallando, si hay una version previa valida.

El usuario final no debe ver conceptos de Knowledge Base, provider sync ni IDs de ElevenLabs. Para el producto, esto es simplemente "contexto del avatar".

## Contratos De Dominio

Para contexto textual del avatar, extender `AvatarAgent` o crear una tabla asociada con:

- `providerContextDocumentId`
- `providerContextSyncStatus`: `not_synced | pending | syncing | synced | failed`
- `providerContextSyncError`
- `providerContextSyncedAt`
- `providerContextSyncFingerprint`
- `providerContextLastUsableAt`

Para documentos subidos, crear `DocumentProviderSync` o campos equivalentes por documento:

- `documentId`
- `provider`: `elevenlabs_knowledge_base`
- `providerDocumentId`
- `providerSyncStatus`: `pending | syncing | synced | failed | deleting | deleted`
- `providerSyncError`
- `providerSyncedAt`
- `providerSyncFingerprint`
- `providerRagIndexStatus`: `not_started | processing | ready | failed`
- `nextRetryAt`
- `attempts`
- `createdAt`
- `updatedAt`

Reglas:

- El estado local de YUNI manda.
- Si el documento se elimina en YUNI, debe desasociarse del Agent y luego borrarse o marcarse para cleanup en ElevenLabs.
- Si falla el sync provider, el documento local no se borra.
- Solo documentos `synced` pueden entrar al Agent payload.
- Si hay una version previa usable, el fallo actual no debe bloquear llamadas.

## Provider ElevenLabs

Extender `ElevenLabsAgentProvider` en `packages/voice` con metodos server-side:

- `createKnowledgeBaseTextDocument(input)`
- `createKnowledgeBaseFileDocument(input)`
- `updateKnowledgeBaseDocument(input)`
- `deleteKnowledgeBaseDocument(input)`
- `computeKnowledgeBaseRagIndex(input)`
- `syncAvatarKnowledgeBase(input)`

El provider debe resumir errores sin guardar secretos. Ejemplos:

- `ElevenLabs Knowledge Base returned 401`
- `file type not supported`
- `document too large`
- `rag index failed`

## Flujo Recomendado

### Fase 1: Contexto textual

1. Al crear o editar avatar, calcular fingerprint de nombre, descripcion, instrucciones, contexto y version de sync KB.
2. Encolar job liviano de context sync.
3. Si no hay `providerContextDocumentId`, crear documento con `POST /knowledge-base/text`.
4. Si ya existe y cambio el fingerprint, actualizar con `PATCH`.
5. Disparar o consultar RAG index si ElevenLabs lo requiere.
6. Guardar estado `synced` y `providerContextDocumentId`.
7. Encolar o ejecutar sync del Agent para asociar el documento.

### Fase 2: Documentos subidos

1. `29-document-upload-api.md` confirma upload y crea `Document`.
2. `30-document-ingestion-worker.md` procesa o valida el documento.
3. Encolar job `document_provider_sync`.
4. El worker descarga el archivo desde storage server-side.
5. Subir archivo o texto extraido a ElevenLabs.
6. Guardar `providerDocumentId`.
7. Disparar o consultar RAG index.
8. Marcar documento como `synced`.
9. Encolar sync del Agent para asociar el nuevo documento.

### Fase 3: Asociacion al Agent

1. Construir lista efectiva de documentos:
   - contexto textual si esta `synced`
   - documentos del avatar con provider sync `synced`
2. Extender payload de Agent.
3. Incluir IDs y fingerprints de KB en `providerSyncFingerprint`.
4. Hacer `PATCH` del Agent cuando cambia la lista.

## APIs YUNI

Endpoints privados implementados:

- `GET /avatars/:avatarId/context`
- `PATCH /avatars/:avatarId/context`
- `POST /avatars/:avatarId/documents/presign-upload`
- `POST /documents/:documentId/confirm-upload`
- `POST /documents/:documentId/retry`
- `DELETE /documents/:documentId`

Reglas de API:

- los endpoints de `POST ...sync` fuerzan o encolan sync para soporte/dev/admin
- la UI normal no depende de esos endpoints como CTA principal
- `GET status` devuelve estado resumido sin storage keys ni payload crudo de ElevenLabs

Actualizar flujos existentes:

- crear/editar avatar encola sync de texto si ElevenLabs esta configurado
- confirmar documento encola ingestion y luego provider sync
- borrar documento encola cleanup provider
- iniciar llamada no debe subir documentos grandes en request path
- iniciar llamada puede disparar verificacion liviana si el fingerprint cambio

## Worker

Crear jobs:

- `avatar_context_provider_sync`
- `document_provider_sync`
- `document_provider_cleanup`
- `agent_provider_sync`

Cada job debe:

- claim con lock para evitar doble upload
- validar ownership/estado vigente
- respetar `nextRetryAt`
- retry con backoff en errores transitorios
- marcar `failed` en errores permanentes
- guardar errores resumidos sin secrets
- emitir logs/metricas para observabilidad

## UX

En avatar profile/edit, tab `Contexto`:

- documento/contexto `Listo`
- documento/contexto `Procesando`
- documento/contexto `No se pudo actualizar`
- sin botones de sync como accion principal
- accion secundaria de soporte/dev para forzar reintento solo si se decide exponerla internamente

En llamada privada o publica:

```txt
Parte del contexto puede no estar actualizado.
```

El aviso es discreto y no bloquea si el Agent base esta disponible.

## Seguridad Y Privacidad

- Nunca enviar API keys al frontend.
- Nunca exponer storage keys al frontend.
- No usar URLs publicas temporales como fuente de ElevenLabs si el backend puede subir el archivo directamente.
- No sincronizar documentos borrados, no confirmados o de otro owner.
- Registrar en tesis que esta arquitectura duplica contexto en un provider externo.
- Para share/public, solo asociar documentos habilitados para el avatar y respetar revocacion de acceso.

## Test Plan

Unit tests en `packages/voice`:

- create text document usa `/v1/convai/knowledge-base/text`.
- create file document usa multipart/form-data y no filtra secrets.
- update document usa el `documentation_id` correcto.
- compute RAG index soporta `processing`, `ready` y errores.
- errores 401/403/400/timeout quedan resumidos.

Tests de dominio/API/worker:

- crear avatar con contexto encola sync.
- editar contexto cambia fingerprint y encola resincronizacion.
- falta de config ElevenLabs deja estado claro sin romper avatar.
- documento confirmado encola ingestion/provider sync.
- documento ajeno no puede sincronizarse.
- documento eliminado queda desasociado del Agent.
- retry respeta backoff y max attempts.

Tests de Agent payload:

- `knowledge_base` incluye solo documentos `synced`.
- documentos `pending`, `failed`, `deleted` no se incluyen.
- fingerprint del Agent cambia cuando cambia la lista de KB docs.
- sigue preservando `pcm_24000`, `text_only=false` y `client_events` completos para LiveAvatar.

Manual acceptance:

1. Crear avatar con contexto textual que mencione un dato unico.
2. Esperar sync background y abrir llamada.
3. Preguntar por ese dato y confirmar respuesta correcta.
4. Subir PDF/TXT con un dato nuevo.
5. Esperar procesamiento/indexacion.
6. Iniciar llamada nueva y preguntar por el dato del documento.
7. Eliminar el documento y confirmar que el Agent deja de usarlo despues del cleanup.
