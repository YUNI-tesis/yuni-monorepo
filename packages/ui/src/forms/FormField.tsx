import type { ReactNode } from "react";

export type FormFieldProps = {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
};

export function FormField({ label, htmlFor, hint, error, children }: FormFieldProps) {
  return (
    <div className="yuni-form-field">
      <label className="yuni-form-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="yuni-form-field__error">{error}</p> : null}
      {hint && !error ? <p className="yuni-form-field__hint">{hint}</p> : null}
    </div>
  );
}
