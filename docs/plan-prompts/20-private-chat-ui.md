# Prompt: Private Chat UI

Armame un plan específico para UI de chat privado.

Objetivo:
Permitir visualizar conversación privada y enviar mensajes cuando la API de chat esté disponible.

Debe incluir:

- ruta `/interact/[avatarId]/conversations/[conversationId]`
- panel de mensajes
- composer
- estados streaming/loading/error
- historial lateral conectado
- nueva conversación

Reglas:

- no editar avatar desde chat
- no implementar provider AI si va en otro módulo
- UI debe soportar mensajes user/assistant/system

Checklist:

- abre conversación específica
- muestra mensajes
- composer preparado para endpoint de chat
- historial navega entre conversaciones
