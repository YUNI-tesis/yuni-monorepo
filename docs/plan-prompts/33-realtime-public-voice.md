# Prompt: Realtime Public Voice

Armame un plan específico para llamada pública con voz.

Objetivo:
Permitir que visitantes usen llamada sobre una `PublicSession`.

Debe incluir:

- validación de public session token
- `RealtimeSession`
- STT/TTS
- Live Avatar lite sandbox
- persistencia
- usage con share/public session
- límites por sesión

Reglas:

- visitante no requiere cuenta
- link debe estar activo para iniciar
- cleanup obligatorio

Checklist:

- llamada pública inicia
- procesa voz
- registra usage
- respeta límites
