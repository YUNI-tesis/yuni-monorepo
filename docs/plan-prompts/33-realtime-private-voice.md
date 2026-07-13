# Prompt: Realtime Private Voice

Armame un plan especifico para llamada privada o compartida autenticada con voz.

Objetivo:
Permitir que el owner o un usuario con acceso compartido inicie llamada sobre una conversacion/avatar permitido.

Debe incluir:

- auth de usuario
- validacion owner o grant activo
- `RealtimeSession`
- STT
- generacion AI o provider hosted segun arquitectura vigente
- TTS/audio output
- Live Avatar session
- interrupcion
- persistencia de mensajes/transcript
- usage
- aviso discreto si el contexto esta procesando o fallo parcialmente

Reglas:

- validar ownership/acceso compartido
- Live Avatar lite sandbox
- cleanup al cerrar
- no mostrar controles tecnicos de force-sync ni diagnostico tecnico en UI normal
- no exponer prompts/contexto/documentos internos

Checklist:

- owner inicia llamada privada
- usuario compartido inicia llamada si tiene grant activo
- procesa audio/texto
- guarda mensajes
- cierra sesion
