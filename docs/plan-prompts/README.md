# YUNI Plan Prompts

Prompts base para pedir planes modulares de YUNI y seguir implementando por partes.

Roadmap operativo para dividir el MVP entre dos personas: [docs/roadmap/mvp-gantt.md](../roadmap/mvp-gantt.md).

Decision de producto vigente: [0009-product-navigation-sharing-background-sync.md](../thesis/decision-records/0009-product-navigation-sharing-background-sync.md).

## Direccion Actual

- `Mis avatares` es la pantalla principal para avatares propios y compartidos.
- `Interactuar` es una accion contextual desde un avatar.
- Compartir soporta links publicos con email obligatorio e invitaciones/accesos por cuenta.
- Sesiones publicas se atribuyen a `participantEmail` y opcionalmente `participantUserId`.
- Sync de Agent/Knowledge Base corre en background con reintentos automaticos; no es CTA principal de usuario.

## Estado

- `00-monorepo-base.md`: implementado.
- `01-config-env.md`: implementado.
- `02-domain-db.md`: implementado; requiere evolucion para grants/email identity.
- `03-dev-infra-env-runtime.md`: implementado dentro de config/env y DB local.
- `04-auth.md`: implementado; sirve como base para vincular emails a cuentas.
- `05-api-structure-observability.md`: implementado como refactor posterior.
- `06-ui-design-system.md`: implementado.
- `07-avatar-domain-api.md`: implementado; debe extender listados para propios/compartidos.
- `08-avatar-builder-ui.md`: implementado.
- `09-avatar-profile-info-ui.md`: implementado; refactorizado como perfil con tabs finales.
- `10-avatar-edit-ui.md`: implementado.
- `11-live-avatar-adapter.md`: implementado.
- `12-live-avatar-selector-stage.md`: implementado.
- `12A-app-shell-navigation-dashboard.md`: pendiente; refactorizado a Inicio + Mis avatares.
- `13-voice-selector-config.md`: implementado.
- `14-documents-filedrop-shell.md`: pendiente; refactorizado a tab Contexto.
- `15-share-links-api.md`: pendiente; refactorizado a links + access grants.
- `16-share-metrics-api.md`: pendiente; refactorizado a actividad por email/cuenta.
- `17-share-tab-ui.md`: pendiente; refactorizado a links e invitaciones.
- `18-interact-shell-ui.md`: implementado parcialmente dentro de `24B`; requiere refactor a accion contextual fullscreen.
- `19-private-conversations-api.md`: pendiente; refactorizado a owner/shared/public identity.
- `20-private-chat-ui.md`: pendiente; refactorizado a owner/shared chat UI.
- `21-public-link-resolver-api.md`: pendiente; refactorizado a identify por email.
- `22-public-avatar-ui.md`: pendiente; refactorizado a entrada por email.
- `23-public-session-api.md`: pendiente; refactorizado a public session identificada.
- `24A-agent-voice-architecture-context-contract.md`: pendiente; actualizado con identity y background sync.
- `24B-elevenlabs-agent-provider-sync.md`: implementado para MVP privado con contexto textual; refactor conceptual a background sync.
- `24C-elevenlabs-knowledge-base-context-sync.md`: pendiente; refactorizado a background jobs/retries.
- `24-openai-adapter-prompt-builder.md`: pendiente.
- `25-private-text-chat-api.md`: pendiente; refactorizado a owner/shared text chat.
- `26-public-text-chat-api.md`: pendiente; refactorizado a public chat con email.
- `27-usage-cost-tracking.md`: pendiente; refactorizado a owner/link/grant/email/user.
- `28-s3-storage-adapter.md`: pendiente; compatible con Contexto.
- `29-document-upload-api.md`: pendiente; refactorizado a processing background.
- `30-document-ingestion-worker.md`: pendiente; refactorizado a enqueue provider sync.
- `31-rag-retriever-integration.md`: pendiente; refactorizado con permisos owner/shared/public.
- `32-realtime-service-foundation.md`: pendiente; refactorizado a identities owner/shared/public.
- `33-realtime-private-voice.md`: pendiente; refactorizado a owner/shared.
- `34-realtime-public-voice.md`: pendiente; refactorizado a public voice con email.
- `35-limits-rate-limits.md`: pendiente; refactorizado a IP/email/user/session/link.
- `36-hardening-observability.md`: pendiente; refactorizado con sync queue/retries.

## Uso

Copiar el prompt del modulo que corresponda, iterarlo si hace falta, y recien despues pedir implementacion en una branch nueva.

Cuando se termina una feature o plan, el agente responsable debe:

- actualizar el estado del plan en este README
- crear o actualizar un decision record en [docs/thesis/decision-records/](../thesis/decision-records/) si cambia una decision
- linkear el plan implementado y las fuentes o evidencia usadas
- si el cambio fue mecanico y no hubo tradeoff relevante, crear igual una nota breve de implementacion explicando eso
