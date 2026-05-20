import type { ReactNode } from "react";

export type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
};

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className="yuni-tooltip">
      {children}
      <span className="yuni-tooltip__content" role="tooltip">
        {content}
      </span>
    </span>
  );
}
