"use client";

import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "default" | "bordered";
  padding?: "none" | "sm" | "md" | "lg";
}

export function Card({
  children,
  className = "",
  variant = "default",
  padding = "md",
  ...props
}: CardProps) {
  const paddingStyles = {
    none: "",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  const variantStyles = {
    default: "bg-white/5 backdrop-blur-sm",
    bordered: "bg-white/5 backdrop-blur-sm border border-white/10",
  };

  return (
    <div
      className={`
        rounded-xl ${variantStyles[variant]} ${paddingStyles[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

