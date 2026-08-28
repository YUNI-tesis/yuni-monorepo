# Thesis Decision Records

Registros de decisiones usadas como insumo para el informe final de tesis.

## Convencion

- Nombre de archivo: `0001-plan-24a-voice-agent-provider-strategy.md`
- Estados validos: `accepted`, `superseded`
- Cada registro nuevo debe tener numero incremental y no debe borrar registros anteriores.
- Si una decision cambia, crear un registro nuevo y marcar el anterior como `superseded`.

## Template

- [0000-template.md](0000-template.md)

## Records

| #    | Registro                                                                                                              | Plan asociado                                                          | Fecha      | Estado     |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- | ---------- |
| 0001 | [Voice Agent Provider Strategy](0001-plan-24a-voice-agent-provider-strategy.md)                                       | `24A-agent-voice-architecture-context-contract.md`                     | 2026-06-04 | superseded |
| 0002 | [ElevenLabs-first MVP Voice Option](0002-plan-24a-elevenlabs-first-mvp-option.md)                                     | `24A-agent-voice-architecture-context-contract.md`                     | 2026-06-04 | accepted   |
| 0003 | [MVP Roadmap Two Person Execution](0003-mvp-roadmap-two-person-execution.md)                                          | `mvp-gantt.md`                                                         | 2026-06-06 | accepted   |
| 0004 | [ElevenLabs + LiveAvatar Private Call MVP](0004-elevenlabs-liveavatar-private-call-mvp.md)                            | `24B-elevenlabs-agent-provider-sync.md`                                | 2026-06-08 | accepted   |
| 0005 | [ElevenLabs Expressive Conversation UX](0005-elevenlabs-expressive-conversation-ux.md)                                | `24B-elevenlabs-agent-provider-sync.md`                                | 2026-06-09 | accepted   |
| 0006 | [ElevenLabs My Voices Catalog + Eager Agent Sync](0006-elevenlabs-my-voices-catalog-eager-agent-sync.md)              | `13-voice-selector-config.md`, `24B-elevenlabs-agent-provider-sync.md` | 2026-06-12 | superseded |
| 0007 | [ElevenLabs Knowledge Base Context Sync](0007-elevenlabs-knowledge-base-context-sync.md)                              | `24C-elevenlabs-knowledge-base-context-sync.md`                        | 2026-06-12 | accepted   |
| 0008 | [ElevenLabs + LiveAvatar Integration Hardening](0008-elevenlabs-liveavatar-integration-hardening.md)                  | `24B-elevenlabs-agent-provider-sync.md`                                | 2026-06-13 | accepted   |
| 0009 | [Product Navigation, Sharing Identity And Background Sync](0009-product-navigation-sharing-background-sync.md)        | `12A`, `15`, `16`, `17`, `18`, `21`, `22`, `23`, `24B`, `24C`          | 2026-06-19 | accepted   |
| 0010 | [Share Links And Access Grants API](0010-share-links-access-grants-api.md)                                            | `15-share-links-api.md`                                                | 2026-07-25 | accepted   |
| 0011 | [Sharing Management UI And Public Preview](0011-sharing-management-ui-public-preview.md)                              | `17`, `21`, `22`                                                       | 2026-07-27 | accepted   |
| 0012 | [Authenticated Shared Interaction Identity](0012-authenticated-shared-interaction-identity.md)                        | `18-interact-shell-ui.md`, `19-private-conversations-api.md`           | 2026-08-10 | accepted   |
| 0013 | [Owner Participant Activity](0013-owner-participant-activity.md)                                                      | `16-share-metrics-api.md`, actividad owner                             | 2026-08-10 | accepted   |
| 0014 | [Identified Public Voice Sessions](0014-identified-public-voice-sessions.md)                                          | `21`, `22`, `23`, `34`, `16`                                           | 2026-08-10 | accepted   |
| 0015 | [Creator Dashboard Actionable Metrics](0015-creator-dashboard-actionable-metrics.md)                                  | dashboard, actividad owner                                             | 2026-08-16 | accepted   |
| 0016 | [Autonomous Multi-avatar Calls](0016-autonomous-multi-avatar-calls.md)                                                | `Interact`, ElevenLabs, LiveAvatar                                     | 2026-08-18 | superseded |
| 0017 | [Server-authoritative Group Orchestration](0017-server-authoritative-group-orchestration.md)                          | `Interact`, LangGraph, ElevenLabs, LiveAvatar                          | 2026-08-18 | superseded |
| 0018 | [Atomic ElevenLabs Group Agents](0018-atomic-elevenlabs-group-agents.md)                                              | `Interact`, LangGraph, ElevenLabs, LiveAvatar                          | 2026-08-19 | superseded |
| 0019 | [Strict Floor With Independent LiveAvatar Group Sessions](0019-strict-floor-independent-liveavatar-group-sessions.md) | `37-group-call-floor-hardening.md`                                     | 2026-08-21 | superseded |
| 0020 | [Configurable External Session Limits](0020-configurable-external-session-limits.md)                                  | `35-limits-rate-limits.md`                                             | 2026-08-14 | accepted   |
| 0021 | [Retire Unused Realtime Service](0021-retire-unused-realtime-service.md)                                              | `00`, `24A`, `32`, `33`, `34`                                          | 2026-08-24 | accepted   |
| 0022 | [Railway MVP Deployment Topology](0022-railway-mvp-deployment-topology.md)                                            | deploy del MVP                                                         | 2026-08-24 | accepted   |
| 0023 | [User-preemptible Group Call Floor](0023-user-preemptible-group-call-floor.md)                                        | `38-user-preemptible-group-call-floor.md`                              | 2026-08-24 | accepted   |

ADR 0023 continúa `accepted` porque conserva la decisión de floor asimétrico, pero incluye una enmienda del 2026-08-25 que retira la persistencia causal del fragmento después de QA real.
