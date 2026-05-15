import type { LoginInput, RegisterInput } from "@yuni/domain";
import type { PasswordService } from "./password";
import type { AuthRepository, PublicUser } from "./repository";
import { toPublicUser } from "./repository";
import { verifySessionToken } from "./session";

export type AuthServiceDependencies = {
  repository: AuthRepository;
  passwords: PasswordService;
};

export type RegisterResult = { ok: true; user: PublicUser } | { ok: false; reason: "email_taken" };

export type LoginResult = { ok: true; user: PublicUser } | { ok: false; reason: "invalid_credentials" };

export function createAuthService({ repository, passwords }: AuthServiceDependencies) {
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

      return { ok: true, user: toPublicUser(user) };
    },

    async getCurrentUserByToken(token: string | undefined): Promise<PublicUser | null> {
      if (!token) {
        return null;
      }

      const session = await verifySessionToken(token);

      if (!session) {
        return null;
      }

      return repository.findPublicById(session.userId);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
