import { Hono } from "hono";
import { LoginInputSchema, RegisterInputSchema } from "@yuni/domain";
import { createSessionToken, clearSessionCookie, getSessionToken, setSessionCookie } from "./session";
import { createAuthService, type AuthServiceDependencies } from "./service";

export type AuthControllerDependencies = AuthServiceDependencies;

function authError(message = "Unauthorized") {
  return {
    error: {
      code: "UNAUTHORIZED",
      message,
    },
  };
}

function validationError(issues: unknown) {
  return {
    error: {
      code: "BAD_REQUEST",
      message: "Invalid request body",
      issues,
    },
  };
}

function conflictError(message: string) {
  return {
    error: {
      code: "CONFLICT",
      message,
    },
  };
}

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
      return context.json(authError("Invalid email or password"), 401);
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
      return context.json(authError(), 401);
    }

    return context.json({ user });
  });

  return auth;
}
