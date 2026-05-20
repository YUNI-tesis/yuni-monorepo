"use client";

import { useState, type InputHTMLAttributes } from "react";
import { cn } from "../utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ invalid = false, className, type, placeholder, ...props }: InputProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isPassword = type === "password";

  if (isPassword) {
    return (
      <span className="yuni-password-input">
        <input
          className={cn("yuni-input", "yuni-input--password", invalid && "yuni-input--invalid", className)}
          aria-invalid={invalid}
          placeholder={placeholder ?? "••••••••"}
          type={isPasswordVisible ? "text" : "password"}
          {...props}
        />
        <button
          className="yuni-password-input__toggle"
          type="button"
          aria-label={isPasswordVisible ? "Ocultar password" : "Mostrar password"}
          aria-pressed={isPasswordVisible}
          onClick={() => setIsPasswordVisible((currentValue) => !currentValue)}
        >
          {isPasswordVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
        </button>
      </span>
    );
  }

  return (
    <input
      className={cn("yuni-input", invalid && "yuni-input--invalid", className)}
      aria-invalid={invalid}
      placeholder={placeholder}
      type={type}
      {...props}
    />
  );
}

function EyeOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4l16 16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path
        d="M9.5 5.6A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-3 3.8M14.1 14.1A3 3 0 0 1 9.9 9.9M6.4 7.2A16 16 0 0 0 2.5 12S6 19 12 19a9.7 9.7 0 0 0 4.2-1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
