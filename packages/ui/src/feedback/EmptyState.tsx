import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="yuni-state">
      <h2 className="yuni-state__title">{title}</h2>
      {description ? <p className="yuni-state__description">{description}</p> : null}
      {action}
    </div>
  );
}
