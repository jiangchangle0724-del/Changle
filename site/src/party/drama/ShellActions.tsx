import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const DramaActionHost = createContext<HTMLElement | null>(null);

/** Only the one-phone game sends a private card or ballot's own button to the shell. */
export function DramaAction({ children, inShell = false }: { children: ReactNode; inShell?: boolean }) {
  const host = useContext(DramaActionHost);
  return inShell ? (host ? createPortal(children, host) : null) : children;
}
