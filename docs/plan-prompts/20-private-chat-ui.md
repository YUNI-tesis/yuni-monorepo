# Prompt: Private And Shared Chat UI

Armame un plan especifico para UI de chat dentro de Interact.

Objetivo:
Permitir visualizar y enviar mensajes en una conversacion privada o compartida cuando la API de chat este disponible.

Rutas:

- `/interact/[avatarId]/conversations/[conversationId]`

Debe incluir:

- panel de mensajes
- composer
- estados streaming/loading/error
- historial lateral conectado
- nueva conversacion
- soporte visual para mensajes:
  - user
  - assistant
  - system
- modo owner
- modo usuario compartido
- acceso al transcript desde la experiencia de llamada

Reglas:

- no editar avatar desde chat
- no implementar provider AI si va en otro modulo
- no mostrar prompts/contexto/documentos internos
- no mostrar conversaciones de otros participantes salvo que el usuario sea owner y este en una vista de Actividad
- Interact sigue siendo accion contextual desde avatar

Checklist:

- abre conversacion especifica
- muestra mensajes
- composer preparado para endpoint de chat
- historial navega entre conversaciones permitidas
- usuario compartido solo ve su propio historial
