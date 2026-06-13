# Prompt: Voice Selector Y Voice Config

Estado: actualizado para ElevenLabs real el 2026-06-12.

Armame un plan específico para configuración de voz en YUNI.

Objetivo:
Permitir seleccionar una voz real de `My Voices` de ElevenLabs y guardar `voiceConfig` en el avatar.

Debe incluir:

- contrato de `voiceConfig`
- endpoint privado para listar voces de ElevenLabs sin exponer API keys
- listado desde `GET /v2/voices` con `voice_type=saved`
- componente `VoiceSelector`
- integración en builder/edit
- validación de provider/voiceId/speakingRate
- preview desde `previewUrl` de ElevenLabs, sin generar TTS nuevo
- preservación de "Voz actual" si la voz guardada ya no está en el catálogo

Reglas:

- no implementar llamada ni TTS real en este módulo
- no clonado de voz
- ElevenLabs se usa como catálogo real de voces
- OpenAI queda solo como compatibilidad legacy
- config debe ser extensible
- API keys quedan server-side

Checklist:

- usuario selecciona voz
- config se guarda
- edit carga voz existente
- schemas rechazan config inválida
- el wizard no muestra voces hardcodeadas de OpenAI
- el backend valida una voz nueva contra `My Voices` cuando ElevenLabs responde correctamente
