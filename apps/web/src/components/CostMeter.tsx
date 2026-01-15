"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/fetch-client";

interface CostMeterProps {
  conversationId: string;
}

export function CostMeter({ conversationId }: CostMeterProps) {
  const [cost, setCost] = useState({ usd: 0, tokensIn: 0, tokensOut: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (conversationId) {
      fetchCost();
      const interval = setInterval(fetchCost, 5000); // Refresh every 5s
      return () => clearInterval(interval);
    }
  }, [conversationId]);

  async function fetchCost() {
    try {
      const res = await fetchWithAuth("/api/cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (res.ok) {
        const data = await res.json();
        setCost(data);
      }
    } catch (err) {
      console.error("Failed to fetch cost", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="glass rounded-lg px-3 py-2 border border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
          <span className="text-xs text-gray-400">Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-lg px-4 py-2 border border-white/10">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-semibold text-white">${cost.usd.toFixed(4)}</span>
        </div>
        <div className="h-4 w-px bg-white/20"></div>
        <div className="text-xs text-gray-400">
          <span className="text-purple-300">{cost.tokensIn.toLocaleString()}</span> in / <span className="text-blue-300">{cost.tokensOut.toLocaleString()}</span> out
        </div>
      </div>
    </div>
  );
}

