/**
 * Wrapper around fetch that automatically redirects to login on 401 responses
 */

export async function fetchWithAuth(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const response = await fetch(url, options);

  // If unauthorized, redirect to login
  if (response.status === 401) {
    // Only redirect if we're not already on an auth page
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
      // Use window.location.href for a full page reload to clear any stale state
      window.location.href = "/auth/login";
      // Return a rejected promise to stop execution
      return Promise.reject(new Error("Unauthorized"));
    }
    throw new Error("Unauthorized");
  }

  return response;
}
