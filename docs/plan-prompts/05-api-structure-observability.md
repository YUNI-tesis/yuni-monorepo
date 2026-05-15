# Prompt: Estructura API Y Observabilidad Base

Armame un plan específico para ordenar `apps/api` por dominios y dejar observabilidad base.

Objetivo:
Evitar que `app.ts` concentre endpoints y preparar la API para crecer por módulos.

Debe incluir:

- carpeta `apps/api/src/domains`
- una carpeta por dominio
- cada dominio con:
  - `controller.ts`
  - `service.ts`
  - `repository.ts`
  - helpers internos si hacen falta
- `app.ts` solo compone middlewares globales y controllers
- logging de requests
- manejo centralizado de errores
- request id
- redacción de secrets en logs

Reglas:

- no cambiar contratos HTTP ya existentes
- no loguear passwords, cookies, JWT, authorization headers ni secrets
- los errores 500 deben quedar logueados server-side
- respuestas de error deben ser JSON consistentes

Checklist:

- Auth sigue funcionando igual
- logs muestran método, path, status, duración y requestId
- `app.ts` no contiene lógica de negocio
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pasan
