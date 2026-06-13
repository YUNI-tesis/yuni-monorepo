# Prompt: App Shell Navigation Y Dashboard

Armame un plan especifico para hacer YUNI navegable como una aplicacion privada coherente.

Objetivo:
Agregar una app shell privada y mejorar el dashboard para que el usuario pueda moverse entre dashboard, avatares, crear avatar, perfil e Interact sin escribir rutas manualmente.

Contexto:

- Hoy existen rutas de auth, dashboard, crear avatar, perfil de avatar y editar avatar.
- `/interact` ya esta protegido por el proxy, pero la ruta no existe todavia.
- El boton `Interactuar` del perfil navega a `/interact/[avatarId]`, que se implementa en `18-interact-shell-ui`.
- Este plan debe ordenar la navegacion antes de seguir creciendo features.

Debe incluir:

- shell privada reusable para rutas autenticadas
- navegacion principal con accesos a:
  - Dashboard
  - Avatares
  - Crear avatar
  - Interact
- dashboard con acciones claras:
  - crear avatar
  - ver avatares propios
  - ir a Interact
- links coherentes desde perfil y edicion
- estados placeholder controlados para rutas futuras, especialmente `/interact` si `18` no esta implementado aun
- responsive basico
- tests de navegacion/render cuando aplique

Reglas:

- no implementar chat real
- no implementar share real
- no implementar voz real
- no cambiar contratos de API salvo que sea imprescindible
- no exponer rutas privadas a usuarios sin sesion
- mantener el estilo del design system existente

Checklist:

- el usuario puede navegar la app privada sin escribir paths manualmente
- dashboard muestra acciones utiles y no solo datos de sesion
- links a rutas futuras no rompen la experiencia
- `Interactuar` tiene una ruta destino coherente con `18`
- auth/proxy sigue protegiendo rutas privadas
