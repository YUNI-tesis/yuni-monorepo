import { auth } from "./auth";
import { AppRouteError } from "./api-errors";

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session.user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppRouteError("Unauthorized", 401);
  }
  return user;
}
