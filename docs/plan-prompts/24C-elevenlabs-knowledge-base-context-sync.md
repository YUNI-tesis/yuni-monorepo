# Prompt: ElevenLabs Knowledge Base Context Sync

Estado: pendiente.

## Objetivo

Integrar el contexto del creador con ElevenLabs Knowledge Base para que el Agent usado por LiveAvatar LITE pueda responder usando documentos y texto cargados en YUNI.

YUNI sigue siendo la fuente de verdad. ElevenLabs Knowledge Base es una copia derivada para mejorar la experiencia conversacional del MVP ElevenLabs-first. Este plan no reemplaza el RAG propio de YUNI definido en `31-rag-retriever-integration.md`.

## Fuentes

- LiveAvatar ElevenLabs Agent Connector: https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent
- ElevenLabs Agents Overview: https://elevenlabs.io/docs/eleven-agents/overview
- ElevenLabs Knowledge Base: https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base
- ElevenLabs Knowledge Base API - create from text: https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/create-from-text
- ElevenLabs Knowledge Base API - create from file: https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/create-from-file
- ElevenLabs Knowledge Base API - create from URL: https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/create-from-url
- ElevenLabs Knowledge Base API - update document: https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/update
- ElevenLabs Knowledge Base API - compute RAG index: https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/compute-rag-index

## Dependencias

- Requiere `24B-elevenlabs-agent-provider-sync.md`, porque el Agent de ElevenLabs ya debe existir y estar asociado al avatar.
- Para contexto textual del avatar, puede implementarse sin esperar documentos reales.
- Para documentos subidos por el creador, requiere `28-s3-storage-adapter.md` y `29-document-upload-api.md`.
- `30-document-ingestion-worker.md` es opcional para este plan si se sube el archivo original a ElevenLabs. Se vuelve necesario si decidimos extraer texto en YUNI y sincronizarlo como documento de texto.
- `31-rag-retriever-integration.md` puede avanzar despues o en paralelo, pero no bloquea este MVP provider-first.

## Alcance MVP

- Sincronizar `AvatarAgent.context` como documento de texto en ElevenLabs Knowledge Base.
- Sincronizar documentos confirmados de YUNI hacia ElevenLabs Knowledge Base.
- Asociar los Knowledge Base document IDs al ElevenLabs Agent del avatar.
- Mantener la llamada privada LiveAvatar LITE + ElevenLabs Connector funcionando con `pcm_24000`.
- Mostrar estados claros de sync para contexto y documentos.
- No exponer API keys, storage keys ni payloads crudos del provider al frontend.

Fuera de alcance:

- RAG propio de YUNI.
- Public share y llamadas publicas.
- Multiagente.
- Creacion o clonacion de voces.
- Edicion avanzada de chunks dentro de ElevenLabs.

## Diseno De Producto

El creador debe poder:

1. Crear o editar un avatar.
2. Escribir instrucciones y contexto textual.
3. Subir documentos asociados al avatar.
4. Ver si cada fuente de contexto esta `synced`, `pending` o `failed`.
5. Iniciar una llamada y hacer preguntas que solo se responden con ese contexto.

El usuario final no debe ver conceptos de Knowledge Base ni IDs de ElevenLabs. Para el producto, esto es simplemente "contexto del avatar".

## Contratos De Dominio

Para contexto textual del avatar, extender `AvatarAgent` o crear una tabla asociada con:

- `providerContextDocumentId`
- `providerContextSyncStatus`: `not_synced | pending | syncing | synced | failed`
- `providerContextSyncError`
- `providerContextSyncedAt`
- `providerContextSyncFingerprint`

Para documentos subidos, crear `DocumentProviderSync` o campos equivalentes por documento:

- `documentId`
- `provider`: `elevenlabs_knowledge_base`
- `providerDocumentId`
- `providerSyncStatus`: `pending | syncing | synced | failed | deleting | deleted`
- `providerSyncError`
- `providerSyncedAt`
- `providerSyncFingerprint`
- `providerRagIndexStatus`: `not_started | processing | ready | failed`
- `createdAt`
- `updatedAt`

Reglas:

- El estado local de YUNI manda.
- Si el documento se elimina en YUNI, debe desasociarse del Agent y luego borrarse o marcarse para cleanup en ElevenLabs.
- Si falla el sync provider, el documento local no se borra.
- Solo documentos `synced` pueden entrar al Agent payload.

## Provider ElevenLabs

Extender `ElevenLabsAgentProvider` en `packages/voice` con metodos server-side:

- `createKnowledgeBaseTextDocument(input)`
- `createKnowledgeBaseFileDocument(input)`
- `createKnowledgeBaseUrlDocument(input)`
- `updateKnowledgeBaseDocument(input)`
- `deleteKnowledgeBaseDocument(input)`
- `computeKnowledgeBaseRagIndex(input)`
- `syncAvatarKnowledgeBase(input)`

Usar:

- `POST /v1/convai/knowledge-base/text` para contexto textual de avatar.
- `PATCH /v1/convai/knowledge-base/:documentation_id` para actualizar documentos textuales o contenido cuando ElevenLabs lo permita.
- `POST /v1/convai/knowledge-base/file` para PDF/TXT/DOCX u otros archivos soportados.
- `POST /v1/convai/knowledge-base/url` solo cuando YUNI agregue fuentes por URL.
- `POST /v1/convai/knowledge-base/:documentation_id/rag-index` para disparar o consultar indexacion RAG si hace falta para disponibilidad inmediata.

El provider debe resumir errores sin guardar secretos. Ejemplos:

- `ElevenLabs Knowledge Base returned 401`
- `file type not supported`
- `document too large`
- `rag index failed`

## Flujo Recomendado

### Fase 1: Contexto textual

1. Al crear o editar avatar, calcular fingerprint de:
   - `name`
   - `description`
   - `instructions`
   - `context`
   - version de sync KB
2. Si no hay `providerContextDocumentId`, crear documento con `POST /knowledge-base/text`.
3. Si ya existe y cambio el fingerprint, actualizar con `PATCH`.
4. Disparar o consultar RAG index si ElevenLabs lo requiere.
5. Guardar `providerContextDocumentId` y estado `synced`.
6. Sincronizar el Agent para que su `knowledge_base` incluya ese documento.

### Fase 2: Documentos subidos

1. `29-document-upload-api.md` confirma el upload y crea `Document`.
2. Encolar job `document_provider_sync`.
3. El worker descarga el archivo desde storage server-side.
4. Subir el archivo a ElevenLabs con `POST /knowledge-base/file`.
5. Guardar `providerDocumentId`.
6. Disparar o consultar RAG index.
7. Marcar documento como `synced`.
8. Encolar o ejecutar sync del Agent para asociar el nuevo documento.

Si el file endpoint de ElevenLabs rechaza un formato que YUNI puede parsear, usar fallback:

1. esperar a `30-document-ingestion-worker.md`
2. extraer texto
3. crear documento con `POST /knowledge-base/text`

### Fase 3: Asociacion al Agent

1. Construir la lista efectiva de Knowledge Base documents:
   - contexto textual del avatar si esta `synced`
   - documentos del avatar con provider sync `synced`
2. Extender el payload de `createElevenLabsAgentPayload`.
3. Reemplazar el `knowledge_base: []` actual por referencias provider verificadas.
4. Incluir IDs y fingerprints de KB en `providerSyncFingerprint`.
5. Hacer `PATCH` del Agent cuando cambia la lista.

Nota de implementacion: al implementar, verificar contra la API actual de ElevenLabs la forma exacta de cada entrada en `conversation_config.agent.prompt.knowledge_base` y cubrirla con tests. El plan define el contrato de producto; el wire shape debe seguir la documentacion vigente del provider.

## APIs YUNI

Agregar endpoints privados:

- `POST /avatars/:avatarId/context-provider/sync`
  - fuerza sync del contexto textual y documentos ya confirmados
  - valida ownership
  - no corre uploads pesados en request path si hay documentos grandes

- `POST /documents/:documentId/provider-sync`
  - fuerza sync de un documento
  - valida ownership por avatar/documento
  - encola job o ejecuta sync si es liviano

- `GET /avatars/:avatarId/context-provider/status`
  - devuelve estado resumido del contexto textual y documentos
  - no devuelve storage keys ni payload crudo de ElevenLabs

Actualizar flujos existentes:

- `POST /avatars` y update de avatar:
  - sincronizan texto de contexto si ElevenLabs esta configurado
  - sincronizan Agent despues de la KB
  - si KB falla, guardan estado `failed` y el avatar se conserva

- `POST /avatars/:avatarId/voice-sessions`:
  - mantiene auto-sync defensivo del Agent
  - no debe subir documentos grandes en el inicio de llamada
  - puede disparar sync liviano de texto si el fingerprint cambio

## Worker

Crear job `document_provider_sync`:

- claim con lock para evitar doble upload
- validar que el documento siga existiendo y pertenezca al avatar
- descargar desde storage
- subir a ElevenLabs
- registrar `providerDocumentId`
- computar o consultar RAG index
- actualizar Agent asociado
- retry con backoff en errores transitorios
- marcar `failed` en errores permanentes

Crear job opcional `document_provider_cleanup`:

- borra o desasocia documentos eliminados
- tolera que el documento remoto ya no exista
- no bloquea la eliminacion local

## UX

En avatar profile/edit, agregar estado de contexto:

- `Contexto sincronizado`
- `Sincronizacion pendiente`
- `Error al sincronizar contexto`
- `Documento pendiente de indexacion`

Para cada documento:

- nombre
- tipo
- fecha de subida
- estado local
- estado provider
- boton `Reintentar sync` si falla

En llamada privada, si hay documentos `failed`, mostrar un aviso discreto antes de iniciar:

```txt
Parte del contexto no esta sincronizado todavia.
```

No bloquear la llamada si al menos el Agent base esta sincronizado.

## Seguridad Y Privacidad

- Nunca enviar API keys al frontend.
- Nunca exponer storage keys al frontend.
- No usar URLs publicas temporales como fuente de ElevenLabs si el backend puede subir el archivo directamente.
- No sincronizar documentos borrados, no confirmados o de otro owner.
- Registrar en tesis que esta arquitectura duplica contexto en un provider externo.
- Para futuro publico/share, definir si un documento esta habilitado para uso publico antes de asociarlo a Agents usados por links publicos.

## Costos Y Tradeoffs

Ventajas:

- Es el camino mas corto para que el avatar responda con documentos reales dentro de ElevenLabs Agents.
- Reduce complejidad frente a construir RAG propio antes del MVP de voz.
- Mantiene LiveAvatar LITE Connector sin cambiar arquitectura de audio.

Costos/riesgos:

- El contexto queda duplicado en ElevenLabs.
- Hay dependencia fuerte del provider para indexacion, limites y calidad de recuperacion.
- Puede haber latencia entre upload y disponibilidad real del documento.
- Los errores de KB no deben romper creacion de avatar ni llamadas basicas.

Decision de producto:

- Usar Knowledge Base de ElevenLabs para el MVP conversacional.
- Mantener `31-rag-retriever-integration.md` como camino posterior para independencia de provider, explicabilidad y soporte de otros canales.

## Test Plan

Unit tests en `packages/voice`:

- create text document usa `/v1/convai/knowledge-base/text`.
- create file document usa multipart/form-data y no filtra secrets.
- update document usa el `documentation_id` correcto.
- compute RAG index soporta `processing`, `ready` y errores.
- errores 401/403/400/timeout quedan resumidos.

Tests de dominio/API:

- crear avatar con contexto crea o actualiza KB text doc.
- editar contexto cambia fingerprint y resincroniza.
- falta de config ElevenLabs deja estado claro sin romper avatar.
- documento confirmado encola `document_provider_sync`.
- documento ajeno no puede sincronizarse.
- documento eliminado queda desasociado del Agent.

Tests de Agent payload:

- `knowledge_base` incluye solo documentos `synced`.
- documentos `pending`, `failed`, `deleted` no se incluyen.
- fingerprint del Agent cambia cuando cambia la lista de KB docs.
- sigue preservando `pcm_24000`, `text_only=false` y `client_events` completos para LiveAvatar.

Manual acceptance:

1. Crear avatar con contexto textual que mencione un dato unico.
2. Sincronizar Agent y abrir llamada.
3. Preguntar por ese dato y confirmar respuesta correcta.
4. Subir PDF/TXT con un dato nuevo.
5. Esperar provider sync/index.
6. Iniciar llamada nueva y preguntar por el dato del documento.
7. Eliminar el documento y confirmar que el Agent deja de usarlo despues del sync.

## Assumptions

- ElevenLabs API key tiene permisos para Agents y Knowledge Base.
- LiveAvatar solo necesita el `agent_id` y el secret de ElevenLabs; no necesita conocer cada documento.
- La disponibilidad real de un documento depende de indexacion en ElevenLabs.
- Para MVP, el primer paso debe ser texto de contexto porque reduce riesgo y no depende de upload/storage.
- Para archivos, se prefiere subir archivo original a ElevenLabs. Si falla por formato o calidad, se usa texto extraido por YUNI como fallback.
