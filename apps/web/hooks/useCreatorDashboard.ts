"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCreatorDashboardSummary,
  type ApiCreatorDashboardSummary,
  type ApiDashboardDays,
} from "../lib/api/dashboard-api";
import { ApiClientError } from "../lib/api/http-client";

export type CreatorDashboardState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: ApiCreatorDashboardSummary; error: null }
  | { status: "error"; data: null; error: string };

type InternalCreatorDashboardState = {
  requestedDays: ApiDashboardDays;
  value: CreatorDashboardState;
};

export function useCreatorDashboard(days: ApiDashboardDays) {
  const router = useRouter();
  const [requestKey, setRequestKey] = useState(0);
  const [timeZone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });
  const [state, setState] = useState<InternalCreatorDashboardState>({
    requestedDays: days,
    value: { status: "loading", data: null, error: null },
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({
      requestedDays: days,
      value: { status: "loading", data: null, error: null },
    });

    void getCreatorDashboardSummary({ days, timeZone, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({
            requestedDays: days,
            value: { status: "ready", data, error: null },
          });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiClientError && error.status === 401) {
          router.push("/auth/login");
          return;
        }

        setState({
          requestedDays: days,
          value: {
            status: "error",
            data: null,
            error: error instanceof Error ? error.message : "No pudimos cargar la actividad.",
          },
        });
      });

    return () => controller.abort();
  }, [days, requestKey, router, timeZone]);

  const reload = useCallback(() => setRequestKey((key) => key + 1), []);

  const visibleState: CreatorDashboardState =
    state.requestedDays === days ? state.value : { status: "loading", data: null, error: null };

  return { ...visibleState, reload };
}
