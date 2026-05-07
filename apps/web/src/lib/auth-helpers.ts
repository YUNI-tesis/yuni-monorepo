import { auth } from "./auth";
import { prisma } from "./prisma";

export class AuthRequiredError extends Error {
  status = 401;

  constructor() {
    super("Unauthorized");
    this.name = "AuthRequiredError";
  }
}

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id && !session?.user?.email) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(session.user.id ? [{ id: session.user.id }] : []),
        ...(session.user.email ? [{ email: session.user.email }] : []),
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthRequiredError();
  }
  return user;
}
