import { auth } from "./auth";

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
    // Throw an error that can be caught in API routes
    const error: any = new Error("Unauthorized");
    error.status = 401;
    error.message = "Unauthorized";
    throw error;
  }
  return user;
}
