import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { Button } from "./Button";
import type { ShowToast, ToastProps } from "./types";
import "./Toast.css";
export function Toast({
  message,
  tone = "neutral",
  action,
  duration,
  onDismiss,
}: ToastProps) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration ?? (action ? 8000 : 4000));
  useEffect(() => {
    remaining.current = duration ?? (action ? 8000 : 4000);
  }, [message, duration, action]);
  useEffect(() => {
    if (paused) return;
    const start = Date.now();
    const timer = window.setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - start));
    };
  }, [paused, message, duration, action]);
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "danger"
        ? CircleAlert
        : tone === "warning"
          ? TriangleAlert
          : Info;
  return (
    <div
      className={`ui-toast ui-toast-${tone}`}
      role={tone === "danger" ? "alert" : "status"}
      aria-atomic="true"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
    >
      <Icon aria-hidden="true" />
      <span className="ui-toast-message">{message}</span>
      {action && (
        <Button
          tone="quiet"
          size="sm"
          onClick={() => {
            action.onClick();
            onDismiss();
          }}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
const ToastContext = createContext<ShowToast | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<
    (Omit<ToastProps, "onDismiss"> & { id: number }) | null
  >(null);
  const sequence = useRef(0);
  const show = useCallback<ShowToast>(
    (message, options) =>
      setToast({ ...options, message, id: ++sequence.current }),
    [],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast &&
        createPortal(
          <Toast
            key={toast.id}
            {...toast}
            onDismiss={() =>
              setToast((current) => (current?.id === toast.id ? null : current))
            }
          />,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast requires ToastProvider");
  return show;
}
