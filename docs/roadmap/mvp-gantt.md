# YUNI MVP Roadmap Gantt

Este documento ordena el trabajo pendiente de YUNI como backlog priorizado. No reemplaza los planes de `docs/plan-prompts/`; los usa como unidades de trabajo.

## Direccion De Producto Vigente

Decision source: [0009-product-navigation-sharing-background-sync.md](../thesis/decision-records/0009-product-navigation-sharing-background-sync.md).

- `Mis avatares` es el centro operativo.
- `Interactuar` es una accion contextual desde un avatar.
- Sharing soporta links publicos con email obligatorio e invitaciones/accesos por cuenta.
- Las sesiones publicas se atribuyen a `participantEmail` y opcionalmente `participantUserId`.
- La sincronizacion de Agent/Knowledge Base corre en background con retries automaticos.
- La UI normal solo muestra fallos o procesamiento relevante de contexto/documentos.

## Estado Actual

- Implementado: planes `00` a `13`, segun `docs/plan-prompts/README.md`.
- Implementado: sharing por grants y llamada autenticada owner/shared con historial aislado por participante (`15`, `17`, `18`, `19`).
- Implementado parcialmente: `21`, `22` y `24B`; la vista publica sigue siendo informativa y la voz conserva sync lazy para owner.
- Pendiente: contexto/documentos reales, actividad/progreso, sesiones publicas identificadas y hardening.
- La estrategia recomendada para MVP sigue siendo validar temprano la experiencia conversacional con ElevenLabs Agents + LiveAvatar LITE, sin esperar a completar RAG propio.

## Regla De Trabajo Para Dos Personas

- Una branch por plan o por bloque chico de planes estrechamente relacionados.
- No tocar el mismo contrato compartido en paralelo sin acordarlo antes.
- Contratos criticos: Prisma/domain schemas, conversation/session identity, share/access grants, provider sync jobs, APIs de documents/public session.
- Cada plan tiene un owner temporal solo mientras esta en progreso.
- Para elegir proximo trabajo, tomar el item disponible de mayor prioridad que no choque con el trabajo activo del otro integrante.
- Al cerrar un plan:
  - actualizar `docs/plan-prompts/README.md`
  - crear o actualizar decision record si cambia una decision
  - dejar tests/verificaciones ejecutadas en el cierre de la tarea

## Backlog Priorizado

| Prioridad | Plan                                                                                      | Tipo                        | Depende de                                         | Resultado                                                      |
| --------- | ----------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| P0        | `12A-app-shell-navigation-dashboard`                                                      | app shell/product structure | `00-13`                                            | Inicio y Mis avatares como navegacion central                  |
| P0        | ajustar `18-interact-shell-ui` a accion contextual                                        | UI/voz                      | `12A`, `24B` actual                                | llamada fullscreen desde avatar, sin nav top-level obligatoria |
| P1        | `15-share-links-api`                                                                      | API/share identity          | avatar domain                                      | links con email e invitaciones/grants                          |
| P1        | `19-private-conversations-api`                                                            | API/conversacion            | implementado owner/shared; publico depende de `23` | conversaciones aisladas por identidad efectiva                 |
| P1        | `17-share-tab-ui`                                                                         | UI/share                    | `15`                                               | gestion de links e invitaciones en perfil                      |
| P1        | `16-share-metrics-api`                                                                    | API/actividad               | `15`, `19`, `27` parcial                           | metricas por link/grant/email/user                             |
| P1        | actividad del perfil owner                                                                | UI/actividad                | `16`, `19`, `20` parcial                           | transcripts, uso y progreso por alumno/email                   |
| P2        | `14-documents-filedrop-shell`                                                             | UI/contexto                 | `09`                                               | tab Contexto preparada                                         |
| P2        | `28-s3-storage-adapter`                                                                   | storage                     | contrato storage acordado                          | storage listo para documentos                                  |
| P2        | `29-document-upload-api`                                                                  | API/documentos              | `14`, `28`                                         | documentos reales subibles y procesables                       |
| P2        | `30-document-ingestion-worker`                                                            | worker/contexto             | `28`, `29`                                         | chunks creados y estados de documento                          |
| P2        | `24C-elevenlabs-knowledge-base-context-sync`                                              | provider/contexto           | `24B`; archivos requieren `28/29/30`               | contexto/documentos sincronizados en background                |
| P3        | `20-private-chat-ui`, `25-private-text-chat-api`                                          | chat autenticado            | `18`, `19`, `24`                                   | chat owner/shared con historial                                |
| P3        | `21-public-link-resolver-api`, `22-public-avatar-ui`, `23-public-session-api`             | publico identificado        | `15`                                               | link publico con email y sesion atribuible                     |
| P3        | `26-public-text-chat-api`                                                                 | publico/chat                | `23`, `25` contract                                | chat publico atribuido a email                                 |
| P3        | `27-usage-cost-tracking`                                                                  | usage/costos                | flujos reales                                      | costos y uso por owner/link/grant/email                        |
| P4        | `31-rag-retriever-integration`                                                            | AI/RAG propio               | `30`                                               | contexto propio recuperable con permisos                       |
| P4        | `32-realtime-service-foundation`, `33-realtime-private-voice`, `34-realtime-public-voice` | realtime/voz                | identity/session contracts                         | voz owner/shared/public coherente                              |
| P4        | `35-limits-rate-limits`, `36-hardening-observability`                                     | cierre                      | flujos reales                                      | MVP medible, seguro y defendible                               |

## Que Es Paralelizable

- `12A` y refactor de `18` si se acuerdan rutas y nav.
- `15` y `17` si se congela el contrato de links/grants.
- `19` y `20` si se congela response de conversations.
- `28` y `29` si se congela `ObjectStorage`.
- `30` y `24C` pueden avanzar en paralelo si se acuerda el estado de documentos.
- `35` y `36` pueden avanzar con contratos finales de identity/session.

## Que No Conviene Paralelizar

- Cambios simultaneos en Prisma/domain schemas y UI dependiente sin contrato acordado.
- Share/access grants y public session identity sin definir migracion de Conversation/UsageEvent.
- Provider sync jobs y upload/ingest sin acordar estados de documento.
- Voz publica antes de cerrar public session con email y limites.

## Prioridades

1. Hacer la app navegable con `Inicio` y `Mis avatares`.
2. Convertir Interact en accion contextual fullscreen desde un avatar.
3. Definir e implementar sharing identity: links con email e invitaciones/grants.
4. Alinear conversaciones, usage y actividad con owner/shared/public identity.
5. Agregar documentos reales y sync background a ElevenLabs Knowledge Base.
6. Abrir experiencia publica por link con email.
7. Completar limits, observabilidad, cleanup y hardening.

## Serie Obligatoria

- `12A` debe ir antes de cerrar la experiencia final de `18`.
- `15` debe existir o tener contrato cerrado antes de `17`, `21`, `22` y `23`.
- `19` debe existir o tener contrato cerrado antes de cerrar `20`, `25` y actividad.
- `29` depende de `28`; `30` depende de `29`; `24C` de archivos depende de `29/30`.
- `23` debe existir antes de `26` y `34`.
- `34` debe esperar voz privada, public session y limits.

## Indicadores De Avance

- Primer hito: Inicio y Mis avatares permiten navegar propios/compartidos.
- Segundo hito: Interact abre llamada contextual con historial preparado.
- Tercer hito: creator comparte por grant y el usuario compartido puede llamar y recuperar su propio historial.
- Cuarto hito: activity muestra metricas/transcripts por alumno/email.
- Quinto hito: documentos del creador se procesan y sincronizan en background.
- Sexto hito: link publico funcional con email, texto/voz y limits.
