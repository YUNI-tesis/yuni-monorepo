"use client";

import React, { useCallback, useEffect, useState } from "react";

export interface WaveformProps {
  data?: number[];
  autoAnimate?: boolean;
  height?: number;
  color?: "gradient" | "purple" | "accent";
  className?: string;
}

/**
 * Waveform visualization component
 * Used to display audio activity below the avatar
 */
export function Waveform({
  data,
  autoAnimate = true,
  height = 64,
  color = "gradient",
  className = "",
}: WaveformProps) {
  const createRandomData = useCallback(
    () => Array.from({ length: 50 }, () => Math.random() * 0.5 + 0.25),
    []
  );

  const [animatedData, setAnimatedData] = useState<number[]>(() => {
    if (data) {
      return data;
    }

    return autoAnimate ? createRandomData() : [];
  });

  useEffect(() => {
    if (!data && autoAnimate) {
      const interval = setInterval(() => {
        setAnimatedData(createRandomData());
      }, 100);
      return () => clearInterval(interval);
    }
  }, [autoAnimate, createRandomData, data]);

  const colorClasses = {
    gradient: "gradient-primary",
    purple: "bg-[#784EAB]",
    accent: "bg-[#D365FF]",
  };

  const waveformData = data ?? (animatedData.length > 0 ? animatedData : Array(50).fill(0.3));

  return (
    <div
      className={`flex items-end justify-center gap-1 rounded-lg bg-surface p-2 border border-theme ${className}`}
      style={{ height: `${height}px` }}
    >
      {waveformData.map((value, index) => (
        <div
          key={index}
          className={`flex-1 rounded-sm ${colorClasses[color]} transition-all duration-100`}
          style={{
            height: `${value * 100}%`,
            minHeight: "4px",
          }}
        />
      ))}
    </div>
  );
}
