"use client";

import { useState, type InputHTMLAttributes } from "react";
import { YuniIcon } from "../icons/YuniIcon";
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
          <YuniIcon name={isPasswordVisible ? "viewOff" : "view"} size={20} />
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
