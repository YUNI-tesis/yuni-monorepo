import type { ReactNode } from "react";

export type ErrorStateProps = {
  title?: string;
  description: string;
  action?: ReactNode;
};

export function ErrorState({ title = "Algo salio mal", description, action }: ErrorStateProps) {
  return (
    <div className="yuni-state" role="alert">
      <h2 className="yuni-state__title">{title}</h2>
      <p className="yuni-state__description">{description}</p>
      {action}
    </div>
  );
}
