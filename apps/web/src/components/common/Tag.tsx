"use client";

import React from "react";

export interface TagProps {
  children: React.ReactNode;
  variant?: "purple" | "gray" | "accent";
  size?: "sm" | "md";
  className?: string;
  onRemove?: () => void;
}

export function Tag({
  children,
  variant = "purple",
  size = "md",
  className = "",
  onRemove,
}: TagProps) {
  const variantStyles = {
    purple: "bg-[#784EAB] text-white",
    gray: "bg-[#333F55] text-gray-300",
    accent: "bg-[#D365FF] text-white",
  };

  const sizeStyles = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
  };

  return (
    <span
      className={`
        inline-flex items-center gap-2 rounded-full font-medium
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="hover:opacity-70 transition-opacity ml-1"
          type="button"
        >
          ×
        </button>
      )}
    </span>
  );
}

