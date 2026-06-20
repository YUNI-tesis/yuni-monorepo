# Prompt: Interact Contextual UI

Armame un plan especifico para la experiencia de Interact como accion contextual de un avatar.

Objetivo:
Separar interaccion del ABM y disenar una pantalla focalizada para llamada/chat sobre un avatar especifico.

Rutas:

- `/interact/[avatarId]`
- `/interact` puede redirigir a `Mis avatares` o mostrar un selector liviano solo como fallback

Debe incluir:

- validacion de acceso al avatar:
  - owner
  - usuario autenticado con acceso compartido
- layout de llamada casi fullscreen
- Live Avatar como elemento principal
- controles inferiores:
  - iniciar/finalizar
  - silenciar
  - estado de conexion/conversacion
  - abrir historial/transcript
- historial/transcript:
  - panel lateral en desktop
  - bottom sheet/drawer en mobile
  - lista de conversaciones anteriores cuando exista API
- datos minimos del avatar sin ocupar el foco
- aviso discreto si parte del contexto esta procesando o fallo, sin bloquear si hay version previa valida
- estado para llamada no disponible

Reglas:

- no editar configuracion desde Interact
- no mostrar diagnostico tecnico en la UI normal
- no implementar chat real si va en otro modulo
- no implementar multiagente/grupos
- no exponer Knowledge Base, provider IDs ni controles tecnicos de force-sync
- Interact no debe ser nav principal obligatoria

Checklist:

- desde Mis avatares o Perfil se abre `/interact/[avatarId]`
- avatar ocupa el foco visual de la pantalla
- controles de llamada no tapan el avatar ni el transcript
- historial queda preparado para conversaciones persistidas
- usuario sin acceso ve error controlado
