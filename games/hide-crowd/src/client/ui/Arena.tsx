// The arena, loaded when it's needed: three.js and the 3D scene are a file of their own (arena.js),
// fetched while the lobby is up, so the lobby opens fast. Until it arrives (or without WebGL) the
// flat arena shows the same crowd.
import { useEffect, useState } from "preact/hooks";
import type { ComponentProps } from "preact";
import type { Arena3D as Arena3DType } from "./Arena3D";

type Module = { Arena3D: typeof Arena3DType };
let loaded: Module | null = null;
let loading: Promise<Module> | null = null;

/** Start fetching the 3D arena (the lobby calls this, so a round starts at once). */
export function preloadArena(): Promise<Module> {
  loading ??= import("./Arena3D").then((module) => (loaded = module));
  return loading;
}

/** ?flat=1 on the address keeps the flat arena (a slow computer, the browser tests). */
const flatOnly = () => {
  try {
    return new URLSearchParams(location.search).get("flat") === "1";
  } catch {
    return false;
  }
};

export function Arena(props: ComponentProps<typeof Arena3DType>) {
  const [module, setModule] = useState<Module | null>(loaded);
  const [flat] = useState(flatOnly);
  useEffect(() => {
    if (module || flat) return;
    let live = true;
    preloadArena()
      .then((next) => live && setModule(next))
      .catch(() => {
        // offline: the flat arena stays
      });
    return () => {
      live = false;
    };
  }, []);
  if (!module || flat) return <div class="arena">{props.fallback}</div>;
  return <module.Arena3D {...props} />;
}
