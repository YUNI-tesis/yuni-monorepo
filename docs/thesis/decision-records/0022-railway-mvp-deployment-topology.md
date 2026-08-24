# Railway MVP Deployment Topology

## Status

accepted

## Related plan

Deploy productivo del MVP.

## Date

2026-08-24

## Context

YUNI necesitaba su primer entorno productivo después de retirar el servicio realtime sin
consumidores. El runtime vigente se compone de Next.js, una API Hono, un worker, PostgreSQL y
almacenamiento S3-compatible. La sesión usa una cookie HTTP-only, por lo que publicar Web y API en
orígenes distintos agrega complejidad de CORS, cookies cross-site y configuración pública.

Railway detecta el monorepo con Railpack, provee red privada entre servicios, PostgreSQL administrado,
buckets S3-compatible y variables de referencia. En pnpm 10, los scripts de instalación de Prisma,
esbuild y sharp requieren una allowlist explícita. Prisma Client también necesita generarse con la
ruta no estándar del schema antes de compilar.

## Options considered

- Web y API públicas en dominios separados: simplifica el routing del frontend, pero amplía la
  superficie pública y obliga a coordinar CORS y cookies entre sitios.
- Un único servicio que ejecute Web, API y worker: reduce recursos, pero mezcla ciclos de vida,
  escalado, logs y tolerancia a fallos de procesos con responsabilidades diferentes.
- Web pública con API y worker privados: conserva separación operativa y presenta un único origen al
  navegador.

## Decision

Se despliega en el proyecto Railway `yuni` con cinco recursos: `web`, `api`, `worker`, `Postgres` y
`yuni-documents`. Sólo Web tiene dominio público. Next.js reescribe `/api/*` hacia
`http://api.railway.internal:4000/*`, mientras API y worker comparten PostgreSQL, providers y bucket
mediante variables de referencia y secretos server-only.

API ejecuta `prisma migrate deploy` antes de iniciar. El build raíz ejecuta `prisma generate` y
autoriza exclusivamente los scripts de instalación requeridos por Prisma, esbuild y sharp. El bucket
acepta `PUT`, `GET` y `HEAD` desde el dominio público de YUNI para soportar uploads presignados.

## Rationale

El proxy same-origin conserva el modelo actual de cookies seguras, evita exponer la API y reduce la
configuración del cliente. Separar worker y API permite observar y escalar carga HTTP y jobs de manera
independiente. PostgreSQL y las migraciones quedan administrados por la misma topología y el bucket no
requiere credenciales dentro del navegador.

## Implementation notes

- Web: `pnpm start:web`, puerto 3000 y dominio
  `https://web-production-304a5.up.railway.app`.
- API: `pnpm start:api`, puerto 4000, un proxy confiable y red privada.
- Worker: `pnpm start:worker`, concurrencia inicial 1.
- API aplicó las 18 migraciones existentes en el primer arranque.
- Los endpoints `/health` y `/api/health` respondieron `ok` después del deploy.
- Apps y PostgreSQL quedaron en la región por defecto `eu-west`; el bucket inicial está en `iad`.
- La primera publicación usó un upload local de Railway CLI. Después de promover el mismo estado a
  `main`, Web, API y worker quedaron conectados a esa rama con autodeploy nativo de Railway;
  `staging` no dispara producción.
- `OPENAI_API_KEY` no se configuró porque no estaba presente localmente; las rutas afectadas conservan
  sus fallbacks determinísticos.

## User/product impact

YUNI queda accesible desde un dominio HTTPS público con registro, login y API same-origin. Los jobs y
flujos de voz usan servicios privados y las cargas de documentos pueden ir al bucket mediante URLs
firmadas.

## Cost/UX/security tradeoffs

La separación usa tres servicios de aplicación además de PostgreSQL y bucket, con mayor costo base que
un proceso único. A cambio, sólo Web queda expuesta, los secretos permanecen server-only y cada runtime
tiene fallos y logs independientes. La diferencia regional entre cómputo y bucket puede agregar
latencia al procesamiento de documentos y debe medirse antes de mover datos o servicios.

## Sources

- [Railway private networking](https://docs.railway.com/guides/private-networking).
- [Railway storage buckets](https://docs.railway.com/guides/storage-buckets).
- [Railway variables](https://docs.railway.com/guides/variables).
- [Railway health checks](https://docs.railway.com/guides/healthchecks).
- Logs de build, migración y runtime del proyecto `yuni` al 2026-08-24.

## Evidence to collect later

- Latencia y costo real por servicio durante el piloto.
- Tiempo de procesamiento de documentos entre `eu-west` e `iad`.
- Necesidad de réplicas, health checks administrados y autodeploy desde una rama protegida.

## Open questions

- Elegir la región definitiva con mediciones desde Argentina y mover el bucket o los servicios si la
  diferencia resulta material.
- Definir si se requiere un entorno Railway separado para deployments automáticos de `staging`.
