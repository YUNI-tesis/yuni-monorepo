"use client";

import { useCallback, useEffect, useState } from "react";
import { getCreatorDashboardSummary, type ApiCreatorDashboardSummary } from "../lib/api/dashboard-api";

export type CreatorDashboardState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: ApiCreatorDashboardSummary; error: null }
  | { status: "error"; data: null; error: string };

export function useCreatorDashboard() {
  const [state, setState] = useState<CreatorDashboardState>({
    status: "loading",
    data: null,
    error: null,
  });

  const load = useCallback(async () => {
    setState({ status: "loading", data: null, error: null });

    try {
      const data = await getCreatorDashboardSummary();
      setState({ status: "ready", data, error: null });
    } catch (error) {
      setState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "No pudimos cargar la actividad.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
