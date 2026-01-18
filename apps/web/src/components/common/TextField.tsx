"use client";

import React from "react";
import { theme } from "@/lib/theme";

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  multiline?: boolean;
  rows?: number;
}

export function TextField({
  label,
  error,
  helperText,
  multiline = false,
  rows = 3,
  className = "",
  ...props
}: TextFieldProps) {
  const baseInputStyles = `
    w-full px-4 py-3
    bg-white/5 border border-white/10 rounded-lg
    text-white placeholder:text-gray-500
    focus:outline-none focus:ring-2 focus:ring-[#D365FF] focus:border-[#D365FF]
    transition-all duration-200
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const InputComponent = multiline ? "textarea" : "input";

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-white mb-2">
          {label}
        </label>
      )}
      <InputComponent
        className={`${baseInputStyles} ${error ? "border-red-500 focus:ring-red-500" : ""} ${className}`}
        rows={multiline ? rows : undefined}
        {...(props as any)}
      />
      {error && (
        <p className="mt-1 text-sm text-red-400">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
}

