import { Hono } from "hono";
import { validationError } from "../../utils/errors";
import type { CreatorSessionEnv } from "../auth/middleware";
import {
  createCreatorDashboardService,
  type CreatorDashboardRange,
  type CreatorDashboardServiceDependencies,
} from "./service";

const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type CreatorDashboardControllerDependencies = CreatorDashboardServiceDependencies;

export function createCreatorDashboardController(dependencies: CreatorDashboardControllerDependencies) {
  const dashboard = new Hono<CreatorSessionEnv>();
  const service = createCreatorDashboardService(dependencies);

  dashboard.get("/dashboard/creator-summary", async (context) => {
    const currentUser = context.get("currentUser");

    const range = parseRange(context.req.query("from"), context.req.query("to"));
    if (!range.ok) {
      return context.json(validationError([{ message: range.message }]), 400);
    }

    return context.json(await service.getSummary(currentUser.id, range.value));
  });

  return dashboard;
}

function parseRange(fromValue?: string, toValue?: string) {
  if (fromValue === undefined && toValue === undefined) {
    return { ok: true as const, value: undefined };
  }

  if (!fromValue || !toValue) {
    return { ok: false as const, message: "from and to must be provided together" };
  }

  const from = parseDateBoundary(fromValue, false);
  const to = parseDateBoundary(toValue, true);
  if (!from || !to) {
    return { ok: false as const, message: "from and to must be valid ISO dates" };
  }

  const duration = to.getTime() - from.getTime();
  if (duration <= 0 || duration > MAX_RANGE_DAYS * DAY_MS) {
    return {
      ok: false as const,
      message: `date range must be between 1 and ${MAX_RANGE_DAYS} days`,
    };
  }

  return { ok: true as const, value: { from, to } satisfies CreatorDashboardRange };
}

function parseDateBoundary(value: string, inclusiveDateOnlyEnd: boolean) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (dateOnly && !parsed.toISOString().startsWith(value)) return null;
  return dateOnly && inclusiveDateOnlyEnd ? new Date(parsed.getTime() + DAY_MS) : parsed;
}
