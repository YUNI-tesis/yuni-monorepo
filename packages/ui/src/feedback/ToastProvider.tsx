"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";
import { ToastPresentation, type ToastProps, type ToastTone } from "./Toast";

const DEFAULT_MAX_VISIBLE = 3;
const DEFAULT_DURATION_MS: Record<ToastTone, number> = {
  info: 5_000,
  success: 5_000,
  warning: 8_000,
  danger: 8_000,
};

export type ToastAnnouncement = "polite" | "assertive";

export type ToastNotification = {
  id?: string;
  dedupeKey?: string;
  tone?: ToastTone;
  title?: ReactNode;
  message: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  dismissLabel?: string;
  durationMs?: number | null;
  announcement?: ToastAnnouncement;
  onDismiss?: () => void;
};

export type ToastMethodOptions = Omit<ToastNotification, "message" | "tone">;

export type ToastApi = {
  show: (notification: ToastNotification) => string;
  success: (message: ReactNode, options?: ToastMethodOptions) => string;
  error: (message: ReactNode, options?: ToastMethodOptions) => string;
  warning: (message: ReactNode, options?: ToastMethodOptions) => string;
  info: (message: ReactNode, options?: ToastMethodOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
};

export type ToastProviderProps = {
  children: ReactNode;
  maxVisible?: number;
};

type ManagedNotification = Omit<ToastNotification, "id" | "tone" | "durationMs"> & {
  id: string;
  tone: ToastTone;
  durationMs: number | null;
  fingerprint: string | null;
  revision: number;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children, maxVisible = DEFAULT_MAX_VISIBLE }: ToastProviderProps) {
  const [notifications, setNotifications] = useState<ManagedNotification[]>([]);
  const notificationsRef = useRef<ManagedNotification[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const visibleLimit = Math.max(1, Math.floor(maxVisible));

  const commit = useCallback((next: ManagedNotification[], removed: ManagedNotification[] = []) => {
    notificationsRef.current = next;
    setNotifications(next);
    for (const notification of removed) notification.onDismiss?.();
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      const removed = notificationsRef.current.filter((notification) => notification.id === id);
      if (removed.length === 0) return;
      commit(
        notificationsRef.current.filter((notification) => notification.id !== id),
        removed
      );
    },
    [commit]
  );

  const dismissAll = useCallback(() => {
    if (notificationsRef.current.length === 0) return;
    const removed = notificationsRef.current;
    commit([], removed);
  }, [commit]);

  const show = useCallback(
    (input: ToastNotification) => {
      const tone = input.tone ?? "info";
      const fingerprint = input.dedupeKey ?? notificationFingerprint(input, tone);
      const existingByFingerprint = fingerprint
        ? notificationsRef.current.find((notification) => notification.fingerprint === fingerprint)
        : undefined;
      const existingById = input.id
        ? notificationsRef.current.find((notification) => notification.id === input.id)
        : undefined;
      const existing = existingByFingerprint ?? existingById;
      let id = existing?.id ?? input.id;
      if (!id) {
        do {
          id = `yuni-toast-${++idRef.current}`;
        } while (notificationsRef.current.some((notification) => notification.id === id));
      }
      const durationMs =
        input.durationMs === undefined ? (input.action ? null : DEFAULT_DURATION_MS[tone]) : input.durationMs;
      const onDismiss = input.onDismiss ?? existing?.onDismiss;
      const notification: ManagedNotification = {
        ...input,
        ...(onDismiss ? { onDismiss } : {}),
        id,
        tone,
        durationMs,
        fingerprint,
        revision: (existing?.revision ?? 0) + 1,
      };
      const withoutExisting = notificationsRef.current.filter((candidate) => candidate.id !== id);
      const uncapped = [...withoutExisting, notification];
      const overflow = Math.max(0, uncapped.length - visibleLimit);
      const removed = overflow > 0 ? uncapped.slice(0, overflow) : [];
      commit(uncapped.slice(overflow), removed);
      return id;
    },
    [commit, visibleLimit]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, options = {}) => show({ ...options, message, tone: "success" }),
      error: (message, options = {}) => show({ ...options, message, tone: "danger" }),
      warning: (message, options = {}) => show({ ...options, message, tone: "warning" }),
      info: (message, options = {}) => show({ ...options, message, tone: "info" }),
      dismiss,
      dismissAll,
    }),
    [dismiss, dismissAll, show]
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !("showPopover" in viewport)) return;

    function syncTopLayer() {
      if (notifications.length === 0) {
        try {
          viewport?.hidePopover();
        } catch {
          // The popover was already closed.
        }
        return;
      }

      try {
        viewport?.hidePopover();
      } catch {
        // The popover was already closed.
      }

      try {
        viewport?.showPopover();
      } catch {
        // Browsers without a complete Popover API use the fixed-position fallback.
      }
    }

    syncTopLayer();
    if (notifications.length === 0) return;

    // Native dialogs also use the top layer. Reopen the non-modal popover after their state changes
    // so notifications remain visible above dialogs and drawers without moving focus.
    const observer = new window.MutationObserver((records) => {
      if (records.some((record) => record.target instanceof window.HTMLDialogElement)) {
        syncTopLayer();
      }
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, [notifications]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        ref={viewportRef}
        className="yuni-toast-viewport"
        popover="manual"
        role="region"
        aria-label="Notificaciones"
      >
        {notifications.map((notification) => (
          <ManagedToast key={notification.id} notification={notification} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast debe usarse dentro de ToastProvider.");
  return context;
}

function ManagedToast({
  notification,
  onDismiss,
}: {
  notification: ManagedNotification;
  onDismiss: (id: string) => void;
}) {
  const [isPaused, setIsPaused] = useState(false);
  const remainingMsRef = useRef(notification.durationMs);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    remainingMsRef.current = notification.durationMs;
  }, [notification.durationMs, notification.revision]);

  useEffect(() => {
    const remainingMs = remainingMsRef.current;
    if (remainingMs === null || isPaused) return;
    if (remainingMs <= 0) {
      onDismiss(notification.id);
      return;
    }

    startedAtRef.current = Date.now();
    const timeoutId = window.setTimeout(() => onDismiss(notification.id), remainingMs);
    return () => {
      window.clearTimeout(timeoutId);
      if (startedAtRef.current !== null) {
        remainingMsRef.current = Math.max(0, remainingMs - (Date.now() - startedAtRef.current));
        startedAtRef.current = null;
      }
    };
  }, [isPaused, notification.id, notification.revision, onDismiss]);

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsPaused(false);
  }

  const assertive =
    notification.announcement === "assertive" ||
    (notification.announcement === undefined && notification.tone === "danger");
  const presentationProps: Omit<ToastProps, "autoDismissMs"> = {
    tone: notification.tone,
    ...(notification.title !== undefined ? { title: notification.title } : {}),
    ...(notification.action !== undefined ? { action: notification.action } : {}),
    ...(notification.icon !== undefined ? { icon: notification.icon } : {}),
    ...(notification.dismissLabel !== undefined ? { dismissLabel: notification.dismissLabel } : {}),
    onDismiss: () => onDismiss(notification.id),
    role: assertive ? "alert" : "status",
    "aria-live": assertive ? "assertive" : "polite",
    onMouseEnter: () => setIsPaused(true),
    onMouseLeave: () => setIsPaused(false),
    onFocusCapture: () => setIsPaused(true),
    onBlurCapture: onBlur,
    children: notification.message,
  };

  return (
    <div className="yuni-toast-viewport__item">
      <ToastPresentation {...presentationProps} />
    </div>
  );
}

function notificationFingerprint(input: ToastNotification, tone: ToastTone) {
  const title = primitiveText(input.title);
  const message = primitiveText(input.message);
  return title !== null && message !== null ? `${tone}:${title}:${message}` : null;
}

function primitiveText(value: ReactNode): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : value == null ? "" : null;
}
