import type { InputHTMLAttributes, ReactNode } from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

export function Checkbox({ label, ...props }: CheckboxProps) {
  return (
    <label className="yuni-checkbox-field">
      <input className="yuni-checkbox" type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}
