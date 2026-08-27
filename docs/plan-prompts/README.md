# YUNI Plan Prompts

Prompts base para pedir planes modulares de YUNI y seguir implementando por partes.

Roadmap operativo para dividir el MVP entre dos personas: [docs/roadmap/mvp-gantt.md](../roadmap/mvp-gantt.md).

Decisiones de producto vigentes:

- [0009-product-navigation-sharing-background-sync.md](../thesis/decision-records/0009-product-navigation-sharing-background-sync.md)
- [0010-share-links-access-grants-api.md](../thesis/decision-records/0010-share-links-access-grants-api.md)
- [0011-sharing-management-ui-public-preview.md](../thesis/decision-records/0011-sharing-management-ui-public-preview.md)
- [0012-authenticated-shared-interaction-identity.md](../thesis/decision-records/0012-authenticated-shared-interaction-identity.md)
- [0013-owner-participant-activity.md](../thesis/decision-records/0013-owner-participant-activity.md)
- [0014-identified-public-voice-sessions.md](../thesis/decision-records/0014-identified-public-voice-sessions.md)
- [0015-creator-dashboard-actionable-metrics.md](../thesis/decision-records/0015-creator-dashboard-actionable-metrics.md)
- [0020-configurable-external-session-limits.md](../thesis/decision-records/0020-configurable-external-session-limits.md)
- [0021-retire-unused-realtime-service.md](../thesis/decision-records/0021-retire-unused-realtime-service.md)
- [0023-user-preemptible-group-call-floor.md](../thesis/decision-records/0023-user-preemptible-group-call-floor.md)

## Direccion Actual

- `Mis avatares` es la pantalla principal para avatares propios y compartidos.
- `Interactuar` es una accion contextual desde un avatar.
- Compartir soporta links publicos con email obligatorio e invitaciones/accesos por cuenta.
- Sesiones publicas se atribuyen a `participantEmail` y opcionalmente `participantUserId`.
- Sync de Agent/Knowledge Base corre en background con reintentos automaticos; no es CTA principal de usuario.
- `Grupos` usa sesiones LiveAvatar LITE independientes, Agents atómicos, posiciones fijas y un floor asimétrico: estricto entre avatares y preemptivo sólo para la voz humana capturada por Scribe. LiveKit compartido queda como evaluación futura.
- El navegador conecta la voz directamente con ElevenLabs/LiveAvatar mediante tokens efímeros; YUNI no despliega un WebSocket propio.

## Estado

- `00-monorepo-base.md`: implementado; `apps/realtime` fue retirado al quedar superseded por la integración directa con providers.
- `01-config-env.md`: implementado.
- `02-domain-db.md`: implementado; evolucionado con grants/email identity en `15`.
- `03-dev-infra-env-runtime.md`: implementado dentro de config/env y DB local.
- `04-auth.md`: implementado; sirve como base para vincular emails a cuentas.
- `05-api-structure-observability.md`: implementado como refactor posterior.
- `06-ui-design-system.md`: implementado.
- `07-avatar-domain-api.md`: implementado; listados propios/compartidos extendidos en `15`.
- `08-avatar-builder-ui.md`: implementado.
- `09-avatar-profile-info-ui.md`: implementado; refactorizado como perfil con tabs finales.
- `10-avatar-edit-ui.md`: implementado.
- `11-live-avatar-adapter.md`: implementado.
- `12-live-avatar-selector-stage.md`: implementado.
- `12A-app-shell-navigation-dashboard.md`: implementado; el 2026-08-16 el Inicio se reemplazó por métricas accionables de actividad para creadores.
- `13-voice-selector-config.md`: implementado.
- `14-documents-filedrop-shell.md`: pendiente; refactorizado a tab Contexto.
- `15-share-links-api.md`: implementado; links + access grants + listado seguro de compartidos.
- `16-share-metrics-api.md`: implementado parcialmente; dashboard owner-level, actividad unificada, recurrencia, sesiones y alertas listos. Costos y desglose específico por link/grant quedan pendientes.
- `17-share-tab-ui.md`: implementado; administra links y accesos sin emails ni metricas.
- `18-interact-shell-ui.md`: implementado para owner y usuarios autenticados con acceso compartido; fullscreen, voz e historial listos.
- `19-private-conversations-api.md`: implementado para owner/shared autenticado; identidad publica queda asociada a `23`.
- `20-private-chat-ui.md`: pendiente; refactorizado a owner/shared chat UI. La lectura de transcripts de llamadas quedo cubierta parcialmente en `18`.
- `21-public-link-resolver-api.md`: implementado; resolver seguro, capabilities e identificación por email listos.
- `22-public-avatar-ui.md`: implementado para voz; consentimiento, llamada pública y reintento listos.
- `23-public-session-api.md`: implementado; sesión identificada, token corto, conversación y cierre listos.
- `24A-agent-voice-architecture-context-contract.md`: superseded para el MVP por la ruta ElevenLabs-first; la alternativa OpenAI Realtime propia queda histórica.
- `24B-elevenlabs-agent-provider-sync.md`: implementado para MVP privado con contexto textual; refactor conceptual a background sync.
- `24C-elevenlabs-knowledge-base-context-sync.md`: pendiente; refactorizado a background jobs/retries.
- `24-openai-adapter-prompt-builder.md`: implementado parcialmente el 2026-06-21 para titulos de conversaciones con OpenAI; falta prompt builder/respuestas de avatar.
- `25-private-text-chat-api.md`: pendiente; refactorizado a owner/shared text chat.
- `26-public-text-chat-api.md`: pendiente; refactorizado a public chat con email.
- `27-usage-cost-tracking.md`: pendiente; refactorizado a owner/link/grant/email/user.
- `28-s3-storage-adapter.md`: pendiente; compatible con Contexto.
- `29-document-upload-api.md`: pendiente; refactorizado a processing background.
- `30-document-ingestion-worker.md`: pendiente; refactorizado a enqueue provider sync.
- `31-rag-retriever-integration.md`: pendiente; refactorizado con permisos owner/shared/public.
- `32-realtime-service-foundation.md`: superseded; no se desplegará un WebSocket propio.
- `33-realtime-private-voice.md`: implementado para owner/shared mediante API y conexión directa al provider.
- `34-realtime-public-voice.md`: implementado mediante API, LiveAvatar, transcript, identidad por email y límites persistentes.
- `35-limits-rate-limits.md`: implementado; cuotas configurables persistentes, protección técnica y
  ciclo de vida externo endurecido.
- `36-hardening-observability.md`: pendiente; refactorizado con sync queue/retries.
- `37-group-call-floor-hardening.md`: implementado; router semántico, audio gate, attempts por conexión, `user_activity`, eventos idempotentes y cleanup durable grupal.
- `38-user-preemptible-group-call-floor.md`: implementado con alcance reducido tras QA; Scribe corta al primer parcial significativo, el backend cancela la ronda y el transcript committed abre un único turno nuevo, sin persistir el fragmento interrumpido.

## Uso

Copiar el prompt del modulo que corresponda, iterarlo si hace falta, y recien despues pedir implementacion en una branch nueva.

Cuando se termina una feature o plan, el agente responsable debe:

- actualizar el estado del plan en este README
- crear o actualizar un decision record en [docs/thesis/decision-records/](../thesis/decision-records/) si cambia una decision
- linkear el plan implementado y las fuentes o evidencia usadas
- si el cambio fue mecanico y no hubo tradeoff relevante, crear igual una nota breve de implementacion explicando eso
