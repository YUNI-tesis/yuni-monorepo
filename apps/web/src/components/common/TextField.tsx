"use client";

import React from "react";

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
    bg-surface border border-theme rounded-lg
    text-theme placeholder:text-muted-theme
    focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:border-[var(--color-focus-ring)]
    transition-all duration-200
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const InputComponent = multiline ? "textarea" : "input";

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-theme mb-2">
          {label}
        </label>
      )}
      <InputComponent
        className={`${baseInputStyles} ${error ? "border-red-500 focus:ring-red-500" : ""} ${className}`}
        rows={multiline ? rows : undefined}
        {...(props as any)}
      />
      {error && (
        <p className="mt-1 text-sm text-error-theme" role="alert">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-1 text-sm text-muted-theme">{helperText}</p>
      )}
    </div>
  );
}

