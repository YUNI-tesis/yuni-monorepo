# YUNI

Base limpia del monorepo de YUNI.

## Requisitos

- Node.js 20+
- pnpm 10.8.1+
- Docker + Docker Compose para PostgreSQL local

## Instalacion

```bash
pnpm install
cp .env.example .env.local
pnpm db:up
pnpm db:migrate:dev
pnpm db:seed
```

## Scripts

```bash
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:up
pnpm db:up:test
pnpm db:down
pnpm db:down:volumes
pnpm db:migrate:dev
pnpm db:seed
pnpm db:reset
```

## Base De Datos Local

YUNI usa PostgreSQL local con Docker Compose.

```bash
pnpm db:up
```

Levanta `postgres` en `localhost:5432` con:

```txt
DATABASE_URL=postgresql://yuni:yuni@localhost:5432/yuni_dev?schema=public
```

Para una DB efimera de test:

```bash
pnpm db:up:test
```

Disponible en:

```txt
TEST_DATABASE_URL=postgresql://yuni:yuni@localhost:5433/yuni_test?schema=public
```

Para reiniciar la DB de desarrollo desde migraciones y seed:

```bash
pnpm db:reset
```

La seed del dashboard es idempotente y recrea únicamente sus registros con fechas relativas al día
de ejecución. Incluye actividad actual e histórica, participantes recurrentes, conversaciones de
texto y voz, una sesión fallida, accesos sin uso y un avatar con error de sincronización. Todos sus
IDs usan el prefijo `dashboard-seed-`, y los demás datos locales no se modifican.

Para verla, iniciá sesión con:

```txt
Email: dashboard-seed@yuni.local
Password: demo-password
```

Para eliminar por completo los usuarios y datos creados por esta seed:

```bash
pnpm db:seed:cleanup
```

Para apagar servicios:

```bash
pnpm db:down
```

Para borrar tambien el volumen persistente de desarrollo:

```bash
pnpm db:down:volumes
```

## Integracion De Voz MVP

La llamada privada ElevenLabs + LiveAvatar usa variables server-only en `.env.local`:

```txt
ELEVENLABS_API_KEY=
LIVEAVATAR_API_KEY=
LIVEAVATAR_ELEVENLABS_SECRET_ID=
```

`ELEVENLABS_DEFAULT_VOICE_ID` es opcional y solo se usa como fallback para avatars legacy que no tengan voz ElevenLabs guardada.

El frontend nunca recibe esas API keys. Para probar una llamada individual, abrir un avatar y usar su acción `Interactuar`; para llamadas de dos o tres participantes, entrar a `/groups`, crear el grupo e iniciar su llamada.

Guia de setup y troubleshooting: [docs/integrations/elevenlabs-liveavatar-mvp.md](docs/integrations/elevenlabs-liveavatar-mvp.md).

## Deploy En Railway

El MVP productivo usa cinco recursos en el proyecto Railway `yuni`:

- `web`: único servicio HTTP público, desplegado en
  [web-production-304a5.up.railway.app](https://web-production-304a5.up.railway.app).
- `api`: servicio HTTP privado accesible desde Web mediante `api.railway.internal`.
- `worker`: proceso privado para jobs asincrónicos.
- `Postgres`: base de datos administrada; la API aplica migraciones antes de arrancar.
- `yuni-documents`: bucket S3-compatible con CORS limitado al dominio público de Web.

El navegador usa rutas same-origin bajo `/api`; Next.js las reescribe hacia `API_INTERNAL_URL`. Esto
mantiene la cookie de sesión en un solo origen y evita publicar la API. Los comandos de producción
son `pnpm start:web`, `pnpm start:api` y `pnpm start:worker`. El build genera Prisma Client antes de
compilar y API respeta el `PORT` inyectado por la plataforma.

Los health checks manuales disponibles son:

```txt
GET /health
GET /api/health
```

El primer deploy se cargó desde el workspace local mediante Railway CLI. Los tres servicios de
aplicación quedaron conectados después a `YUNI-tesis/yuni-monorepo`: cada push a `main` actualiza
producción automáticamente mediante la Railway GitHub App, cuyo acceso está limitado a este
repositorio; `staging` no dispara deployments de este entorno.

## Estructura

```txt
apps/
  web/        Next.js App Router
  api/        API HTTP principal
  worker/     Procesos async

packages/
  db/
  domain/
  config/
  ui/
  ai/
  voice/
  avatars/
  storage/
  observability/
```

## Documentacion De Tesis

El material para el informe final vive en [docs/thesis/README.md](docs/thesis/README.md).

Cada feature o plan terminado debe actualizar su estado en `docs/plan-prompts/README.md` y dejar un decision record en `docs/thesis/decision-records/` con decisiones de diseno, tradeoffs, fuentes y notas de implementacion utiles para la tesis.
