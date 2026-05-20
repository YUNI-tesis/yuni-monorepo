import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "../utils";

export type PageShellProps = HTMLAttributes<HTMLElement> & {
  centered?: boolean;
  maxWidth?: string;
};

export function PageShell({ centered = false, maxWidth, className, children, style, ...props }: PageShellProps) {
  const innerStyle = maxWidth ? ({ "--yuni-page-width": maxWidth } as CSSProperties) : undefined;

  return (
    <main className={cn("yuni-page-shell", centered && "yuni-page-shell--center", className)} style={style} {...props}>
      <div className="yuni-page-shell__inner" style={innerStyle}>{children}</div>
    </main>
  );
}
