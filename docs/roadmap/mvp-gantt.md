# YUNI MVP Roadmap Gantt

Este documento ordena el trabajo pendiente de YUNI como backlog priorizado. La idea es que dos personas puedan agarrar el siguiente plan disponible segun tiempo y disponibilidad, sin quedar encasilladas en roles fijos. No reemplaza los planes de `docs/plan-prompts/`; los usa como unidades de trabajo.

## Estado Actual

- Implementado: planes `00` a `13`, segun `docs/plan-prompts/README.md`.
- Pendiente: `14` en adelante, mas los nuevos planes `12A`, `24B` y `24C`.
- La app ya tiene rutas privadas para dashboard, auth, avatares y edicion.
- Todavia falta una navegacion global que una la app como producto.
- `/interact` esta protegido en el proxy, pero la ruta no existe. Se implementa en `18-interact-shell-ui`.
- La estrategia recomendada para MVP es validar temprano la experiencia conversacional con ElevenLabs Agents + LiveAvatar LITE, sin esperar a completar RAG propio.

## Regla De Trabajo Para Dos Personas

- Una branch por plan o por bloque chico de planes estrechamente relacionados.
- No tocar el mismo contrato compartido en paralelo sin acordarlo antes. Contratos criticos: schemas de dominio, Prisma, `packages/ai`, `packages/voice`, APIs de conversation/session/document.
- Cada plan tiene un owner temporal solo mientras esta en progreso. El owner no es fijo por persona ni por area.
- Para elegir proximo trabajo, tomar el item disponible de mayor prioridad que no choque con el trabajo activo del otro integrante.
- Al cerrar un plan:
  - actualizar `docs/plan-prompts/README.md`
  - crear o actualizar un decision record en `docs/thesis/decision-records/`
  - dejar tests/verificaciones ejecutadas en el cierre de la tarea

## Backlog Priorizado

| Prioridad | Plan | Tipo | Depende de | Se puede hacer en paralelo con | Resultado |
| --- | --- | --- | --- | --- | --- |
| P0 | `12A-app-shell-navigation-dashboard` | app shell/routing | `00-13` | revision de `13`/`24A`, docs | app navegable sin escribir paths |
| P0 | revisar si `13` alcanza para ElevenLabs real | revision/contrato | `13`, `24A` | `12A` | definir si hace falta follow-up de voz |
| P1 | `18-interact-shell-ui` | UI/routing | `12A` | `14` | entrada visual para interactuar con avatar |
| P1 | `14-documents-filedrop-shell` | UI/context shell | `00-13` | `18` | contexto/documentos visibles sin upload real |
| P1 | `19-private-conversations-api` | API/conversacion | DB actual, contrato acordado | `20` si se congela response | conversaciones privadas persistidas |
| P1 | `20-private-chat-ui` | UI/conversacion | `18`, contrato de `19` | `19` | historial y composer preparados |
| P2 | `24B-elevenlabs-agent-provider-sync` | provider/voz | `13`, `24A`, idealmente `19` | UI de llamada si eventos estan acordados | agente ElevenLabs sincronizable |
| P2 | ajuste UI de llamada privada dentro de Interact | UI/voz | `18`, `24B` contract | `24B` | demo privada avatar + voz |
| P2 | `28-s3-storage-adapter` | storage | contrato storage acordado | `29` | storage listo para documentos |
| P2 | `29-document-upload-api` | API/documentos | `14`, `28` contract | `28` | documentos reales subibles |
| P2 | `24C-elevenlabs-knowledge-base-context-sync` | provider/contexto | `24B`; texto puede ir antes de `28/29`, archivos requieren `28/29` | `30`, `31` con contrato de documentos acordado | contexto real disponible en ElevenLabs Agent |
| P3 | `30-document-ingestion-worker` | worker/contexto | `28`, `29` | UI estados docs | chunks creados |
| P3 | `31-rag-retriever-integration` | AI/RAG | `30` o chunks disponibles | polish UI/docs | contexto propio recuperable |
| P3 | `15-share-links-api` | API/share | avatar domain | `17` con contrato | links publicos administrables |
| P3 | `17-share-tab-ui` | UI/share | `15`, `16` opcional | `15` con contrato | gestion de links en perfil |
| P4 | `21-public-link-resolver-api`, `22-public-avatar-ui`, `23-public-session-api`, `26-public-text-chat-api` | publico | share base | partes API/UI con contrato | experiencia publica por link |
| P4 | `27-usage-cost-tracking`, `35-limits-rate-limits`, `36-hardening-observability` | cierre | flujos reales | entre si con cuidado | MVP medible y defendible |
| P4 | `34-realtime-public-voice` | voz publica | voz privada + public session | hardening | llamada publica |

## Que Es Paralelizable

- `12A` y revision de provider/voz: si quien revisa provider no toca navegacion global.
- `18` y `14`: Interact shell y filedrop shell son UI separadas.
- `19` y `20`: API y UI pueden avanzar en paralelo si primero se acuerda el contrato minimo de conversation.
- `15/21/23/26` y `17/22`: share/public API y UI pueden avanzar en paralelo con contratos cerrados.
- `28` y `29`: storage adapter y upload API pueden avanzar en paralelo si se congela `ObjectStorage`.
- `24C` en modo texto puede avanzar despues de `24B` sin esperar upload real; la parte de archivos debe esperar `28/29`.

## Que No Conviene Paralelizar

- Cambios simultaneos en Prisma/domain schemas y UI que dependan de esos campos sin contrato acordado.
- `24B`/`24C` y `32/33` tocando provider/session protocol al mismo tiempo sin definir eventos primero.
- `30` ingestion y `31` retriever antes de acordar formato de `DocumentChunk`.
- Voz publica `34` antes de validar voz privada o provider ElevenLabs en `24B`.

## Prioridades

1. Hacer la app navegable con `12A`. Es prioridad porque reduce friccion diaria y permite mostrar el producto como una aplicacion, aunque algunas pantallas sean placeholders.
2. Implementar `18` para que el boton `Interactuar` deje de apuntar a una ruta inexistente.
3. Preparar conversacion privada con `19` y `20`, porque voz y texto necesitan una entidad conversation estable.
4. Hacer `24B` como spike ElevenLabs-first, porque la experiencia conversacional es el mayor riesgo de producto.
5. Agregar documentos reales despues de validar el loop de voz, empezando por `24C` para sync simple a ElevenLabs Knowledge Base antes de RAG propio.
6. Recien despues abrir publico/share y hardening.

## Serie Obligatoria

- `12A` debe ir antes de `18`, porque `18` necesita entrar en una app navegable.
- `18` debe ir antes de `20`, porque `20` vive dentro de Interact.
- `19` debe existir o tener contrato cerrado antes de cerrar `20`.
- `24B` debe existir antes de implementar una llamada privada real con ElevenLabs.
- `24C` depende de `24B`; su parte de documentos depende de `28` y `29`.
- `28` y `29` deben existir antes de `30`.
- `30` debe existir antes de `31`, salvo que `31` use mocks/chunks seed para spike.
- Voz publica `34` debe esperar a voz privada y public session.

## Como Agarrar Trabajo Del Backlog

1. Mirar si hay un P0 disponible. Si lo hay, tomar P0.
2. Si P0 esta tomado, elegir un P1 que no toque los mismos archivos/contratos que el trabajo activo.
3. Si dos items dependen entre si, acordar primero el contrato minimo y documentarlo en el plan o decision record.
4. Si una persona tiene menos disponibilidad esa semana, toma tareas de revision, docs, tests o UI acotada; si tiene mas disponibilidad, toma planes que cierren una fase.
5. No avanzar a P3/P4 si queda bloqueado un P0/P1 necesario para demo.

## Siguiente Trabajo Recomendado

Backlog disponible ahora:

1. `12A-app-shell-navigation-dashboard`
2. revision de `13` contra ElevenLabs real y `24A`
3. `14-documents-filedrop-shell`

Si dos personas trabajan esta semana, la combinacion mas limpia es:

- una toma `12A`
- la otra toma revision de `13` o `14`

Cuando `12A` termine, el siguiente item natural es `18-interact-shell-ui`.

## Indicadores De Avance

- Primer hito: se puede navegar desde dashboard a crear avatar, perfil e interact sin escribir paths manualmente.
- Segundo hito: se puede abrir `/interact/[avatarId]` con layout de conversacion preparado.
- Tercer hito: existe conversacion privada persistida y visible.
- Cuarto hito: demo privada con avatar, voz, interrupcion y contexto textual.
- Quinto hito: documentos del creador sincronizados a contexto del agente.
- Sexto hito: link publico funcional.
