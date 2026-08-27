import { Hono } from "hono";
import { LoginInputSchema, RegisterInputSchema } from "@yuni/domain";
import { conflictError, unauthorizedError, validationError } from "../../utils/errors";
import type { CreatorSessionEnv } from "./middleware";
import { createSessionToken, clearSessionCookie, setSessionCookie } from "./session";
import { createAuthService, type AuthServiceDependencies } from "./service";

export type AuthControllerDependencies = AuthServiceDependencies;

export function createAuthController(dependencies: AuthControllerDependencies) {
  const auth = new Hono();
  const service = createAuthService(dependencies);

  auth.post("/auth/register", async (context) => {
    const body: unknown = await context.req.json().catch(() => null);
    const parsed = RegisterInputSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    const result = await service.register(parsed.data);

    if (!result.ok) {
      return context.json(conflictError("Email already registered"), 409);
    }

    const token = await createSessionToken(result.user);

    setSessionCookie(context, token);

    return context.json({ user: result.user }, 201);
  });

  auth.post("/auth/login", async (context) => {
    const body: unknown = await context.req.json().catch(() => null);
    const parsed = LoginInputSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    const result = await service.login(parsed.data);

    if (!result.ok) {
      return context.json(unauthorizedError("Invalid email or password"), 401);
    }

    const token = await createSessionToken(result.user);

    setSessionCookie(context, token);

    return context.json({ user: result.user });
  });

  auth.post("/auth/logout", (context) => {
    clearSessionCookie(context);

    return context.json({ ok: true });
  });

  return auth;
}

export function createCurrentUserController() {
  const auth = new Hono<CreatorSessionEnv>();

  auth.get("/me", (context) => context.json({ user: context.get("currentUser") }));

  return auth;
}
