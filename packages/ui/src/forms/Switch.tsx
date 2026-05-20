import type { InputHTMLAttributes, ReactNode } from "react";

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

export function Switch({ label, ...props }: SwitchProps) {
  return (
    <label className="yuni-switch-field">
      <input className="yuni-switch" type="checkbox" role="switch" {...props} />
      <span>{label}</span>
    </label>
  );
}
