import { Hono } from "hono";
import { LoginInputSchema, RegisterInputSchema } from "@yuni/domain";
import { conflictError, unauthorizedError, validationError } from "../../utils/errors";
import { createSessionToken, clearSessionCookie, getSessionToken, setSessionCookie } from "./session";
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

  auth.get("/me", async (context) => {
    const user = await service.getCurrentUserByToken(getSessionToken(context));

    if (!user) {
      clearSessionCookie(context);
      return context.json(unauthorizedError(), 401);
    }

    return context.json({ user });
  });

  return auth;
}
