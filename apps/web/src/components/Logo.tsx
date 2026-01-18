"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  useSvg?: boolean; // Option to use SVG file instead of CSS-based logo
}

/**
 * YUNI Logo Component
 * Features the interconnected purple and blue dots with gradient text
 * Can use SVG file from /assets/logo.svg or fallback to CSS-based logo
 */
export function Logo({ 
  className = "", 
  size = "md", 
  showText = true,
  useSvg = true 
}: LogoProps) {
  const [svgError, setSvgError] = useState(false);
  
  const sizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
  };

  const logoSizes = {
    sm: { width: 24, height: 24 },
    md: { width: 32, height: 32 },
    lg: { width: 40, height: 40 },
  };

  const dotSizes = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-10 h-10",
  };

  return (
    <Link href="/" className={`flex items-center gap-3 ${className}`}>
      {useSvg && !svgError ? (
        <div className={`relative ${dotSizes[size]}`} style={{ flexShrink: 0 }}>
          <Image
            src="/assets/logo.svg"
            alt="YUNI Logo"
            width={logoSizes[size].width}
            height={logoSizes[size].height}
            className="object-contain"
            onError={() => setSvgError(true)}
          />
        </div>
      ) : (
        <div className={`relative ${dotSizes[size]}`}>
          {/* First dot (purple) */}
          <div
            className={`absolute ${dotSizes[size]} rounded-full bg-[#BE6ADC] blur-sm opacity-80`}
            style={{
              boxShadow: `0 0 20px rgba(190, 106, 220, 0.6)`,
            }}
          />
          <div className={`absolute ${dotSizes[size]} rounded-full gradient-primary`} />

          {/* Second dot (blue) - overlapping */}
          <div
            className={`absolute right-0 top-0 ${dotSizes[size]} rounded-full bg-[#64C3D7] blur-sm opacity-80`}
            style={{
              boxShadow: `0 0 20px rgba(100, 195, 215, 0.6)`,
              transform: "translate(25%, -25%)",
            }}
          />
          <div
            className={`absolute right-0 top-0 ${dotSizes[size]} rounded-full bg-gradient-to-br from-[#BE6ADC] to-[#64C3D7]`}
            style={{
              transform: "translate(25%, -25%)",
            }}
          />
        </div>
      )}
      {showText && (
        <span className={`font-bold gradient-text ${sizeClasses[size]}`}>YUNI</span>
      )}
    </Link>
  );
}

