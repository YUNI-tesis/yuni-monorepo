# Prompt: Voice Selector Y Voice Config

Armame un plan específico para configuración de voz en YUNI.

Objetivo:
Permitir seleccionar voz y guardar `voiceConfig` en el avatar.

Debe incluir:

- contrato de `voiceConfig`
- lista inicial de voces OpenAI
- componente `VoiceSelector`
- integración en builder/edit
- validación de provider/voiceId/speakingRate
- preview visual si aplica, sin TTS real todavía

Reglas:

- no implementar llamada ni TTS real en este módulo
- no clonado de voz
- no ElevenLabs salvo placeholder futuro
- config debe ser extensible

Checklist:

- usuario selecciona voz
- config se guarda
- edit carga voz existente
- schemas rechazan config inválida
