"use client";

import { useEffect, type HTMLAttributes, type ReactNode } from "react";
import { YuniIcon, type YuniIconName } from "../icons/YuniIcon";
import { cn } from "../utils";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  tone?: ToastTone;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  dismissLabel?: string;
  onDismiss?: () => void;
  autoDismissMs?: number | null;
};

const defaultIcons: Record<ToastTone, YuniIconName> = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "error",
};

export function Toast({ autoDismissMs = 5000, onDismiss, ...props }: ToastProps) {
  useEffect(() => {
    if (!onDismiss || autoDismissMs === null) return;

    const timeoutId = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timeoutId);
  }, [autoDismissMs, onDismiss]);

  return <ToastPresentation {...props} {...(onDismiss ? { onDismiss } : {})} />;
}

export function ToastPresentation({
  tone = "info",
  title,
  children,
  action,
  icon,
  dismissLabel = "Cerrar notificación",
  onDismiss,
  className,
  role,
  "aria-live": ariaLive,
  ...props
}: Omit<ToastProps, "autoDismissMs">) {
  const resolvedIcon = icon === undefined ? <YuniIcon name={defaultIcons[tone]} size={20} /> : icon;

  return (
    <div
      className={cn("yuni-toast", `yuni-toast--${tone}`, className)}
      role={role ?? (tone === "danger" ? "alert" : "status")}
      aria-live={ariaLive ?? (tone === "danger" ? "assertive" : "polite")}
      aria-atomic="true"
      {...props}
    >
      {resolvedIcon ? (
        <span className="yuni-toast__icon" aria-hidden="true">
          {resolvedIcon}
        </span>
      ) : null}
      <div className="yuni-toast__content">
        {title ? <strong className="yuni-toast__title">{title}</strong> : null}
        <div className="yuni-toast__message">{children}</div>
        {action ? <div className="yuni-toast__action">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button className="yuni-toast__dismiss" type="button" aria-label={dismissLabel} onClick={onDismiss}>
          <YuniIcon name="close" size={18} />
        </button>
      ) : null}
    </div>
  );
}
