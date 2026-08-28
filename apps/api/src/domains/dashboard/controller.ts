import { createLogger } from "@yuni/observability";
import { Hono } from "hono";
import { validationError } from "../../utils/errors";
import type { CreatorSessionEnv } from "../auth/middleware";
import {
  CREATOR_DASHBOARD_PERIODS,
  createCreatorDashboardService,
  type CreatorDashboardDays,
  type CreatorDashboardServiceDependencies,
} from "./service";

const logger = createLogger("@yuni/api:creator-dashboard");

export type CreatorDashboardControllerDependencies = CreatorDashboardServiceDependencies;

export function createCreatorDashboardController(dependencies: CreatorDashboardControllerDependencies) {
  const dashboard = new Hono<CreatorSessionEnv>();
  const service = createCreatorDashboardService(dependencies);

  dashboard.get("/dashboard/creator-summary", async (context) => {
    const currentUser = context.get("currentUser");

    const options = parseOptions(context.req.query("days"), context.req.query("timeZone"));
    if (!options.ok) {
      return context.json(validationError([{ message: options.message }]), 400);
    }

    const startedAt = performance.now();
    try {
      const summary = await service.getSummary(currentUser.id, options.value);
      logger.info("Creator dashboard summary generated", {
        durationMs: Math.round(performance.now() - startedAt),
        days: options.value.days,
        timeZone: options.value.timeZone,
      });
      return context.json(summary);
    } catch (error) {
      logger.error("Creator dashboard summary generation failed", {
        durationMs: Math.round(performance.now() - startedAt),
        days: options.value.days,
        timeZone: options.value.timeZone,
        error,
      });
      throw error;
    }
  });

  return dashboard;
}

function parseOptions(daysValue?: string, timeZoneValue?: string) {
  const normalizedDays = daysValue ?? "30";
  if (!CREATOR_DASHBOARD_PERIODS.some((days) => String(days) === normalizedDays)) {
    return { ok: false as const, message: "days must be one of 7, 30 or 90" };
  }
  const days = Number(normalizedDays) as CreatorDashboardDays;

  const timeZone = timeZoneValue ?? "UTC";
  if (timeZone.length > 100 || !isValidTimeZone(timeZone)) {
    return { ok: false as const, message: "timeZone must be a valid IANA time zone" };
  }

  return {
    ok: true as const,
    value: { days, timeZone },
  };
}

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}
