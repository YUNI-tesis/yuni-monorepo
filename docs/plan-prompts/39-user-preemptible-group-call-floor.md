# 39 - Floor grupal preemptivo exclusivo del usuario

## Estado

**Reconstrucción desde `main`: fase 1 EN VALIDACIÓN, 2026-09-08.** El intento de agosto fue implementado y cubierto por tests, pero falló QA con proveedores reales. No se considera terminado ni se importa completo en la nueva rama `lucaslovaglio/group-user-barge-in-v2`.

Checkpoint actual: contrato provider validado y tres turnos completados en la aplicación con STT simulado; respuestas cortas completas **NO ACEPTADAS** por energía del stream silenciada después del primer end. Corregir y repetir esa aceptación antes de la fase 2. La [evidencia sanitizada](../thesis/evidence/2026-09-08-group-provider-command-contract.md) separa los ensayos y sus perfiles TTS.

## Objetivo y problema

Permitir que una frase nueva de la persona detenga al avatar, cancele la ronda anterior y devuelva al orquestador la decisión del próximo turno. Su contexto debe distinguir lo que el Agent generó, el fragmento informado por el provider y lo que quedó pendiente o no se sabe si se oyó.

La base de `main` funciona localmente y desplegada según la validación del usuario. El intento acumulado introdujo silencios, superposición, falsos cortes y turnos preparando sin voz. El análisis del 2026-09-08 encontró contexto recibido por ElevenLabs pero ausencia del `user_message`. La comparación real posterior reprodujo el fallo con ID custom `group-turn:...` y recibió mensajes/audio con la base sin ID, UUID manual y API pública `0.0.18`. Esto valida el contrato de envío; la prueba de aplicación posterior aisló además un límite del gate heredado de la base, que cierra antes de que desaparezca toda la energía del stream.

## Secuencia de implementación y aceptación

### Fase 1: transporte y llamada normal

- Partir de `main` y preservar la rama anterior y los commits de respaldo. Recuperar sólo piezas revisadas, con su evidencia.
- Fijar el SDK LiveAvatar `0.0.18` y utilizar `ElevenLabsAgentSession` en grupos, con sus métodos públicos para mensaje, contexto y actividad.
- Correlacionar el UUID retornado con sesión, attempt, epoch, turno y avatar. No enviar `group-turn:...` como `event_id` externo ni tratar la publicación confiable como ACK del Agent.
- Verificar readiness de sesión, recepción real de la orden en ElevenLabs, inicio de audio y final de turno. No hacer redelivery ciego cuando no hay progreso.
- Mantener TTS y comportamiento conversacional de la base durante la comparación. No habilitar barge-in antes de esta aceptación.
- Aceptación: tres avatares responden al turno dirigido, uno por vez; respuestas cortas y largas completas; contexto recibido por el siguiente; IDs y lifecycle registrados con proveedores reales. Tests de contrato y lifecycle acompañan, sin sustituir QA.

### Fase 2: cancelación y nuevo ruteo

- Reutilizar Scribe como único micrófono. Detectar una frase humana significativa durante respuesta, cortar el audio y cancelar toda la ronda anclada al turno esperado.
- Hacer idempotente la cancelación; resolver avance A→B dentro de la misma ronda y rechazar eventos de una ronda previa.
- Conservar el committed si llega antes del ACK y abrir una sola ronda posterior cuando la anterior esté cancelada. No esperar corrección textual para cortar o cancelar.
- Verificar el contrato real de terminal/reutilización del connector. `interrupt(): void` no confirma cancelación provider.
- Aceptación: un corte por intervención real, ningún committed perdido, backchannels/eco sin falso corte, micrófono muteado sin barge-in y eventos tardíos incapaces de afectar una ronda posterior.

### Fase 3: contexto interrumpido

- Representar por separado borrador generado, fragmento informado por provider y pendiente/desconocido, conforme a ADR 0026.
- Usar `agent_response_correction` atribuida al turno como evidencia textual cuando llegue. No convertir transcripción o texto completo en certeza de exposición acústica.
- Cuando falta evidencia, conservar incertidumbre y el borrador como generado. No inventar una división exacta de dicho/pendiente.
- Propagar la distinción al orquestador y al próximo avatar. Las correcciones tardías actualizan el turno original sin reabrir el floor.
- Aceptación: tests y QA muestran un nuevo pedido atendido con contexto coherente, sin repetir automáticamente todo el borrador ni asumir que la persona oyó su final.

### Fase 4: QA acústico y mejoras de naturalidad

- Probar parlantes/auriculares, desktop/mobile y DevTools cerrado; respuestas breves y largas, backchannels, interrupciones reales, red y CPU degradadas.
- Comparar grabación fuente y navegador antes de atribuir distorsión a TTS, transporte o gate.
- Evaluar `eleven_v3_conversational` y filtrado de fondo como experimentos separados. No incorporar otra infraestructura de conversación en esta reparación.
- Registrar fecha, commit, configuración, casos y resultado. Ninguna fase se marca implementada o validada sin evidencia correspondiente.

## Invariantes y límites

- Un solo avatar audible y Scribe como única entrada humana.
- YUNI autoriza turnos y cancela rondas; los eventos del provider no originan otra preempción humana.
- La cancelación no espera el texto corregido y el transcript committed nunca se descarta por el orden de eventos.
- Los IDs internos, IDs de transporte e idempotencia backend tienen propósitos separados.
- Texto generado, fragmento provider y audio oído se distinguen explícitamente.
- Se preservan los datos existentes. Esta fase de transporte no requiere migración ni reset de base.
- No se agregan subtítulos, diagnóstico técnico visible, micrófonos por connector ni cambios de llamadas individuales.

Los timers, el reducer acústico, el preset TTS y el descarte del fragmento del intento anterior permanecen como antecedentes; no son condiciones heredadas por la reconstrucción. La evidencia histórica se conserva en Git y el estudio de caso.

## Decisión y evidencia

- [ADR 0026](../thesis/decision-records/0026-user-preemptible-group-call-floor.md)
- [Estudio de caso: estabilidad de audio e interrupciones grupales](../thesis/group-call-audio-stability-case-study.md)
- [Evidencia sanitizada del contrato provider](../thesis/evidence/2026-09-08-group-provider-command-contract.md)
- [Guía operativa y checklist de diagnóstico](../integrations/group-calls-elevenlabs-liveavatar.md)
