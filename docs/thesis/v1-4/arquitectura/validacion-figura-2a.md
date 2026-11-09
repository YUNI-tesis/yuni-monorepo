# Figura 2A: validación y versión nueva

3 de noviembre de 2026. La Figura 2A de la V1.2 se contrastó con el código del corte del informe (commit `3d8cfd2`) y con los ADR 0019, 0021, 0022 y 0023. La versión nueva la genera [generar_figura_2a.py](generar_figura_2a.py) y queda en `figura-2a-arquitectura.svg` y `.png` (3200 × 2000).

## Qué tenía la versión anterior

La forma general era correcta: tres áreas (navegador, servicios de YUNI y proveedores), proxy `/api`, API Hono, worker con cola en PostgreSQL, S3 y los tres proveedores.

| Hallazgo                                                                                                                                                                                                                                                                                    | Evidencia                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| La flecha LiveAvatar → navegador iba en un solo sentido. El navegador llama a la API de sesiones de LiveAvatar (`/v1/sessions/start`, `keep-alive`, `stop`), entra a la sala LiveKit con el micrófono y, en grupos, envía `sendContextualUpdate` y `sendUserMessage` por el canal de datos. | SDK `@heygen/liveavatar-web-sdk` 0.0.18; `apps/web/components/interact/GroupInteractCall.tsx:758,792` |
| Faltaba la carga directa del navegador al bucket (PUT con URL prefirmada).                                                                                                                                                                                                                  | `apps/web/lib/api/avatar-api.ts:290-313`; ADR 0022                                                    |
| Faltaban las llamadas directas de la API a ElevenLabs: token de Scribe, sincronización del agente grupal al iniciar, sincronización forzada y catálogo de voces.                                                                                                                            | `packages/voice/src/index.ts:425`; `apps/api/src/domains/avatar-groups/service.ts:183-197,603`        |
| Faltaba el WebSocket de Scribe entre el navegador y ElevenLabs.                                                                                                                                                                                                                             | `GroupInteractCall.tsx` (`@elevenlabs/client`)                                                        |
| Faltaban la confirmación de la API sobre el objeto (`HeadObject`) y el borrado de originales.                                                                                                                                                                                               | `apps/api/src/domains/context/service.ts:73,86,101`                                                   |
| El worker también borra objetos y pide a LiveAvatar cerrar sesiones (`session_cleanup`).                                                                                                                                                                                                    | `apps/worker/src/knowledge-base-worker.ts:369,477,533-538`                                            |
| La API también ejecuta limpieza de sesiones cada 15 s.                                                                                                                                                                                                                                      | `apps/api/src/app.ts:411-464`                                                                         |
| OpenAI Responses también genera títulos de conversación.                                                                                                                                                                                                                                    | `packages/ai/src/index.ts:30,54-61`                                                                   |

No existen en el código: proveedor de identidad externo (la autenticación es propia, con JWT en cookie HttpOnly), servicio de email, servicio de observabilidad (logs JSON por stdout), Redis (el limitador es en memoria), webhooks entrantes de proveedores ni cron externo.

## Qué muestra la versión nueva

El formato sigue la gramática de los diagramas de referencia de AWS y Azure: contenedores por límite de despliegue, logos de cada servicio, flechas por tipo de flujo y pasos numerados. YUNI no corre en AWS: los contenedores son los reales de Railway (ADR 0022).

- Railway, proyecto `yuni`, entorno `production`: `web` es el único servicio con dominio público; `api`, `worker` y PostgreSQL están en la red privada `railway.internal` (región `eu-west`); el bucket `yuni-documents`, compatible con S3, está en `iad`.
- GitHub Actions valida cada cambio y Railway despliega `main` cuando termina la CI (ADR 0023).
- Las flechas apuntan desde quien inicia la comunicación.

Se omiten, para no recargar el dibujo: la limpieza de sesiones que el worker pide a LiveAvatar, el borrado de archivos, el catálogo de voces y la sincronización forzada. La nota de la figura lo aclara.

## Nota propuesta para el Doc

> Nota. Elaboración propia a partir del código del corte y de los ADR 0019, 0021, 0022 y 0023 (Equipo YUNI, 2026a, 2026c). Las flechas apuntan desde quien inicia la comunicación. (1) Creadores y participantes usan YUNI desde el navegador. (2) Las operaciones de negocio viajan por HTTPS al servicio web, el único con dominio público. (3) La web reenvía `/api` a la API por la red privada de Railway. (4) La API guarda estado, permisos, historial y trabajos en PostgreSQL. (5) El navegador sube los originales al bucket con una URL prefirmada y la API confirma el objeto. (6) El worker reclama el trabajo, lee el original y sincroniza el agente y su base de conocimiento en ElevenLabs. (7) La API crea la sesión LITE en LiveAvatar; en grupos, además obtiene el token de Scribe, sincroniza el agente grupal cuando corresponde y pide el plan de ronda a OpenAI. (8) El navegador inicia la sesión y se une a la sala WebRTC de LiveAvatar. (9) LiveAvatar usa el agente de ElevenLabs mediante su conector. (10) En grupos, el navegador transcribe la voz humana con Scribe. (11) GitHub Actions valida cada cambio y Railway despliega `main`. Se omiten la limpieza de sesiones y el borrado de archivos.

## Inserción

La figura es apaisada (16:10). A 450 pt de ancho, en una página vertical, el texto queda por debajo de 5 pt. Conviene ubicarla en una sección con orientación horizontal o girada en página completa. Así, el texto ronda los 7 pt.
