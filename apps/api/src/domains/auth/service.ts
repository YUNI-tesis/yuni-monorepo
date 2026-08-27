import type { LoginInput, RegisterInput } from "@yuni/domain";
import { createLogger } from "@yuni/observability";
import type { PasswordService } from "./password";
import type { AuthRepository, PublicUser } from "./repository";
import { toPublicUser } from "./repository";

const logger = createLogger("@yuni/api:auth");

export type AuthServiceDependencies = {
  repository: AuthRepository;
  passwords: PasswordService;
  accessGrantLinker?: {
    linkActiveForUser(userId: string, participantEmail: string): Promise<unknown>;
  };
};

export type RegisterResult = { ok: true; user: PublicUser } | { ok: false; reason: "email_taken" };

export type LoginResult = { ok: true; user: PublicUser } | { ok: false; reason: "invalid_credentials" };

export function createAuthService({ repository, passwords, accessGrantLinker }: AuthServiceDependencies) {
  return {
    async register(input: RegisterInput): Promise<RegisterResult> {
      const existingUser = await repository.existsByEmail(input.email);

      if (existingUser) {
        return { ok: false, reason: "email_taken" };
      }

      const passwordHash = await passwords.hash(input.password);
      const user = await repository.createWithPassword({
        email: input.email,
        passwordHash,
        ...(input.name ? { name: input.name } : {}),
      });
      await linkAccessGrantsBestEffort(accessGrantLinker, user.id, user.email);

      return { ok: true, user };
    },

    async login(input: LoginInput): Promise<LoginResult> {
      const user = await repository.findByEmail(input.email);

      if (!user) {
        return { ok: false, reason: "invalid_credentials" };
      }

      const passwordMatches = await passwords.verify(input.password, user.passwordHash);

      if (!passwordMatches) {
        return { ok: false, reason: "invalid_credentials" };
      }

      await linkAccessGrantsBestEffort(accessGrantLinker, user.id, user.email);

      return { ok: true, user: toPublicUser(user) };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

async function linkAccessGrantsBestEffort(
  accessGrantLinker: AuthServiceDependencies["accessGrantLinker"],
  userId: string,
  participantEmail: string
) {
  if (!accessGrantLinker) return;

  try {
    await accessGrantLinker.linkActiveForUser(userId, participantEmail);
  } catch (error) {
    logger.error("Failed to link access grants during authentication", {
      userId,
      error: error instanceof Error ? error.message : "Unknown access grant linking error",
    });
  }
}
