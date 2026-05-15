# Prompt: Auth MVP

Armame un plan específico para Auth en YUNI.

Objetivo:
Permitir que creadores creen cuenta, inicien sesión y administren sus avatares.

Debe incluir:

- registro
- login
- logout
- sesión actual
- protección de rutas privadas
- ownership server-side
- middleware/proxy de Next
- APIs privadas
- validaciones
- manejo de errores

Decisiones fijadas:

- email/password
- password hashing con bcrypt
- JWT en cookie httpOnly
- frontend llama directo a `apps/api` usando `NEXT_PUBLIC_API_URL` + `credentials: "include"`
- Next usa `proxy.ts` para protección básica de rutas privadas

No incluir:

- roles colaborativos
- organizaciones
- social login
- recuperación de contraseña

El plan debe separar:

- frontend auth
- backend auth
- session handling
- guards
- tests

Checklist:

- usuario puede registrarse
- usuario puede loguearse
- usuario puede cerrar sesión
- `/me` devuelve sesión actual
- rutas privadas bloquean anónimos
- APIs privadas no aceptan `userId` del cliente
