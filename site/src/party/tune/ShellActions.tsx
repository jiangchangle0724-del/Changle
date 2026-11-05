import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const TuneActionHost = createContext<HTMLElement | null>(null);

/** A mode keeps its own handlers and sends only its advancing buttons to the shell. */
export function TuneAction({ children }: { children: ReactNode }) {
  const host = useContext(TuneActionHost);
  return host ? createPortal(children, host) : null;
}
