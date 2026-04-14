import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppRouteError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AppRouteError";
    this.status = status;
  }
}

export function isAppRouteError(error: unknown): error is AppRouteError {
  return error instanceof AppRouteError;
}

export function getErrorMessage(error: unknown, fallback = "Internal server error"): string {
  return error instanceof Error ? error.message : fallback;
}

export function errorHasMessage(error: unknown, message: string): boolean {
  return error instanceof Error && error.message.toLowerCase().includes(message.toLowerCase());
}

export function jsonErrorResponse(error: unknown): NextResponse {
  if (isAppRouteError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues }, { status: 400 });
  }

  return NextResponse.json(
    { error: getErrorMessage(error) },
    { status: 500 }
  );
}
