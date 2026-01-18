"use client";

import React from "react";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
}

export function Select({
  label,
  error,
  helperText,
  options,
  className = "",
  ...props
}: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-white mb-2">
          {label}
        </label>
      )}
      <select
        className={`
          w-full px-4 py-3
          bg-white/5 border border-white/10 rounded-lg
          text-white
          focus:outline-none focus:ring-2 focus:ring-[#D365FF] focus:border-[#D365FF]
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? "border-red-500 focus:ring-red-500" : ""}
          ${className}
        `}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#0E0418]">
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-red-400">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
}

