import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const PunchActionHost = createContext<HTMLElement | null>(null);

/** Keep the writer's validation local while its submit button sits in the shell. */
export function PunchAction({ children }: { children: ReactNode }) {
  const host = useContext(PunchActionHost);
  return host ? createPortal(children, host) : null;
}
