"use client";

import React, { useEffect, useState } from "react";

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
  const [animatedData, setAnimatedData] = useState<number[]>([]);

  useEffect(() => {
    if (!data && autoAnimate) {
      // Generate random waveform data for animation
      const generateRandomData = () => {
        return Array.from({ length: 50 }, () => Math.random() * 0.5 + 0.25);
      };
      setAnimatedData(generateRandomData());
      const interval = setInterval(() => {
        setAnimatedData(generateRandomData());
      }, 100);
      return () => clearInterval(interval);
    } else if (data) {
      setAnimatedData(data);
    }
  }, [data, autoAnimate]);

  const colorClasses = {
    gradient: "gradient-primary",
    purple: "bg-[#784EAB]",
    accent: "bg-[#D365FF]",
  };

  const waveformData = animatedData.length > 0 ? animatedData : Array(50).fill(0.3);

  return (
    <div
      className={`flex items-end justify-center gap-1 rounded-lg bg-white/5 p-2 border border-white/10 ${className}`}
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

