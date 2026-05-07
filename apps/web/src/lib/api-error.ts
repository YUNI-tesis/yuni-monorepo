export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

export function isZodError(error: unknown): boolean {
  return error instanceof Error && error.name === "ZodError";
}

export function getZodIssues(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  if ("issues" in error) return (error as { issues?: unknown }).issues;
  if ("errors" in error) return (error as { errors?: unknown }).errors;
  return undefined;
}
