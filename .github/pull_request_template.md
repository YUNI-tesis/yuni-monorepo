## Resumen

<!-- Qué cambia y por qué. -->

## Validación

- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`

## Seguridad y operación

- [ ] No agregué secretos, credenciales ni datos personales al repositorio o a los logs.
- [ ] Revisé cambios de dependencias y migraciones.
- [ ] Las migraciones son compatibles con la versión productiva anterior o están separadas mediante
      expand/contract.
- [ ] Actualicé documentación y decision records cuando corresponde.

Los PRs de feature apuntan a `staging`. Sólo `staging` y los parches de seguridad de Dependabot
pueden abrir PRs hacia `main`.
