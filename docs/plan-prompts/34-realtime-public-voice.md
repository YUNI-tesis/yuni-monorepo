# Prompt: Realtime Public Voice

> Estado: implementado para el MVP sin un servidor WebSocket propio de YUNI. `RealtimeSession`
> conserva el ciclo de vida durable, pero el transporte de voz ocurre mediante los SDK de los
> providers. Ver decision record `0021`.

Armame un plan especifico para llamada publica con voz.

Objetivo:
Permitir que participantes identificados por email usen llamada sobre una `PublicSession`.

Debe incluir:

- validacion de public session token
- validacion de `participantEmail`
- `participantUserId?` si existe cuenta vinculada
- `RealtimeSession`
- STT/TTS o provider hosted segun arquitectura vigente
- Live Avatar lite sandbox
- persistencia de transcript
- usage con share/public session/email
- limites por sesion, email, IP y avatar/link
- aviso de contexto parcialmente desactualizado si aplica

Reglas:

- participante no requiere cuenta, pero si una sesion con email
- link debe estar activo para iniciar
- cleanup obligatorio
- no exponer prompts/contexto/documentos
- owner podra ver actividad y transcripts desde la tab `Actividad`

Checklist:

- llamada publica inicia con sesion identificada
- procesa voz
- registra transcript
- registra usage atribuido a email/link/session
- respeta limites
