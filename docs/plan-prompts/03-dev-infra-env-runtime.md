# Prompt: Dev Infra, Docker DB Y Runtime Env

Armame un plan específico para infraestructura local y manejo de env runtime de YUNI.

Objetivo:
Permitir que el desarrollo local tenga PostgreSQL con Docker Compose y que los procesos carguen envs de forma centralizada, sin duplicar loaders por app/package.

Debe incluir:

- `docker-compose.yml`
- Postgres dev
- Postgres test efímero
- scripts root:
  - `db:up`
  - `db:up:test`
  - `db:down`
  - `db:down:volumes`
  - `db:reset`
- `.env.example`
- `.env` local de desarrollo
- runner centralizado en `packages/config`
- comportamiento local vs production

Reglas:

- local carga `.env` y `.env.local` desde root
- production no carga archivos `.env`; usa envs inyectadas por plataforma
- Prisma scripts usan el runner central
- apps runtime usan el loader central si necesitan arrancar desde código
- no duplicar loaders en `apps/api` ni `packages/db`
- no exportar loaders Node-only desde el barrel principal si puede contaminar frontend

Checklist:

- `pnpm db:up` levanta Postgres dev
- `pnpm db:generate` encuentra `DATABASE_URL`
- `pnpm db:migrate:dev` funciona
- `pnpm db:seed` funciona
- `pnpm dev:api` encuentra `DATABASE_URL`
- `pnpm build` no arrastra `node:fs` al frontend
