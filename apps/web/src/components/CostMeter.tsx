"use client";

import { useEffect, useState } from "react";

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
      const res = await fetch("/api/cost", {
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
    return <div className="text-sm text-gray-500">Cargando costos...</div>;
  }

  return (
    <div className="text-sm text-gray-600 space-y-1">
      <div className="font-semibold">Costo: ${cost.usd.toFixed(4)}</div>
      <div className="text-xs">
        Tokens: {cost.tokensIn.toLocaleString()} in / {cost.tokensOut.toLocaleString()} out
      </div>
    </div>
  );
}

