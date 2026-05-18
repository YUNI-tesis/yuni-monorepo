# Prompt: Realtime Private Voice

Armame un plan específico para llamada privada con voz.

Objetivo:
Permitir que el creador inicie llamada privada sobre una conversación/avatar propio.

Debe incluir:

- auth de creador
- `RealtimeSession`
- STT
- generación AI
- TTS/audio output
- Live Avatar session
- interrupción
- persistencia de mensajes
- usage

Reglas:

- validar ownership
- Live Avatar lite sandbox
- cleanup al cerrar

Checklist:

- inicia llamada privada
- procesa audio/texto
- guarda mensajes
- cierra sesión
