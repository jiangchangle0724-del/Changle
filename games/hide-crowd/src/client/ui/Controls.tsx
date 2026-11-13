// The phone in your hand: a stick under the left thumb, Punch, Blend in and Distract under the right.
// Also the keyboard (arrows or WASD, Space, Shift, E) and a gamepad (left stick, A, X, Y).
// Thumbs tap fast: nothing here may zoom, scroll, select or pop a menu. A button waiting for its
// move to come back stays a live target (aria-disabled, not disabled), so a quick second tap still
// lands on it and is kept from the browser, instead of falling through as a double tap that zooms.
import { useEffect, useRef, useState } from "preact/hooks";
import { SIMULATION_STEP_MS } from "../../engine";
import type { ClientMsg, MeView } from "../../room/protocol";
import { t } from "../i18n";

type Vec = { x: number; y: number };
const ZERO: Vec = { x: 0, y: 0 };
/** a held stick is resent this often even when it doesn't move (the room brakes a body after 250 ms of silence) */
const KEEPALIVE_MS = 150;
const quantize = (v: Vec): Vec => ({ x: Math.round(v.x * 20) / 20, y: Math.round(v.y * 20) / 20 });

export function Controls(props: { me: MeView; now: number; send: (message: ClientMsg) => void; onVector: (value: Vec) => void }) {
  const [vector, setVector] = useState<Vec>(ZERO);
  const root = useRef<HTMLDivElement>(null);
  const vectorRef = useRef(vector);
  const lastSent = useRef<{ v: Vec; at: number }>({ v: ZERO, at: 0 });
  const heldKeys = useRef(new Set<string>());
  const gamepadButtons = useRef({ punch: false, blend: false, distract: false });
  const gamepadDriving = useRef(false);
  const { send, onVector } = props;
  vectorRef.current = vector;

  const apply = (next: Vec) => {
    setVector(next);
    onVector(next);
  };

  // movement goes out once a frame at most: when it changed, and now and then while held
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = quantize(vectorRef.current);
      const last = lastSent.current;
      const moving = Math.hypot(current.x, current.y) > 0.05;
      const changed = current.x !== last.v.x || current.y !== last.v.y;
      const now = Date.now();
      if (changed || (moving && now - last.at >= KEEPALIVE_MS)) {
        send({ t: "move", x: current.x, y: current.y });
        lastSent.current = { v: current, at: now };
      }
    }, SIMULATION_STEP_MS);
    return () => window.clearInterval(timer);
  }, [send]);

  const updatePointer = (event: PointerEvent) => {
    const element = event.currentTarget as HTMLDivElement;
    const rect = element.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    let y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const length = Math.hypot(x, y);
    if (length <= 0.08) {
      x = 0;
      y = 0;
    } else {
      // a small dead zone, then a gentle curve: fine steps near the middle, a run at the edge
      const remapped = (Math.min(1, length) - 0.08) / 0.92;
      const response = remapped * 0.78 + remapped * remapped * 0.22;
      x = (x / length) * response;
      y = (y / length) * response;
    }
    apply({ x, y });
  };

  const release = (event: PointerEvent) => {
    const element = event.currentTarget as HTMLDivElement;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    apply(ZERO);
  };

  useEffect(() => {
    const keysVector = () => {
      const keys = heldKeys.current;
      const x = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
      const y = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
      apply({ x, y });
    };
    const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const movementKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"];
    const keyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector("dialog[open], .sheet.is-open")) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (movementKeys.includes(key)) {
        event.preventDefault();
        heldKeys.current.add(key);
        keysVector();
      } else if (!event.repeat && (key === "Shift" || key === " " || key === "e") && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        send({ t: key === "Shift" ? "blend" : key === "e" ? "distract" : "punch" });
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      heldKeys.current.delete(key);
      if (movementKeys.includes(key)) keysVector();
    };
    const blur = () => {
      heldKeys.current.clear();
      apply(ZERO);
    };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  // the browser's own gestures, off while thumbs are on the controls: a touch that starts on them is
  // never a scroll, a double-tap zoom, a text selection or a long-press menu (pointer events still come)
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const hold = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    element.addEventListener("touchstart", hold, { passive: false });
    element.addEventListener("touchend", hold, { passive: false });
    return () => {
      element.removeEventListener("touchstart", hold);
      element.removeEventListener("touchend", hold);
    };
  }, []);

  useEffect(() => {
    if (!navigator.getGamepads) return;
    const deadzone = 0.18;
    const axis = (value: number) => {
      const magnitude = Math.abs(value);
      if (magnitude < deadzone) return 0;
      return Math.sign(value) * Math.pow((magnitude - deadzone) / (1 - deadzone), 1.35);
    };
    const timer = window.setInterval(() => {
      const pad = Array.from(navigator.getGamepads()).find((candidate) => candidate?.connected);
      if (!pad) {
        gamepadButtons.current = { punch: false, blend: false, distract: false };
        if (gamepadDriving.current) {
          gamepadDriving.current = false;
          apply(ZERO);
        }
        return;
      }
      const dpadX = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
      const dpadY = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
      const x = Math.max(-1, Math.min(1, axis(pad.axes[0] ?? 0) + dpadX));
      const y = Math.max(-1, Math.min(1, axis(pad.axes[1] ?? 0) + dpadY));
      const punch = Boolean(pad.buttons[0]?.pressed);
      const blend = Boolean(pad.buttons[2]?.pressed);
      const distract = Boolean(pad.buttons[3]?.pressed);
      const active = Math.hypot(x, y) > 0 || punch || blend || distract;
      if (active || gamepadDriving.current) {
        gamepadDriving.current = active;
        apply({ x, y });
      }
      if (punch && !gamepadButtons.current.punch) send({ t: "punch" });
      if (blend && !gamepadButtons.current.blend) send({ t: "blend" });
      if (distract && !gamepadButtons.current.distract) send({ t: "distract" });
      gamepadButtons.current = { punch, blend, distract };
    }, 50);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  const punchReady = props.now >= props.me.punchReadyAt;
  const blendReady = props.now >= props.me.blendReadyAt;
  const distracts = props.me.distracts ?? 0;
  return (
    <div class="controls" ref={root}>
      <div
        class="stick"
        role="group"
        aria-label={t("stick")}
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updatePointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePointer(event);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span class="stick__ring" aria-hidden="true" />
        <span class="stick__knob" aria-hidden="true" style={{ transform: `translate(${vector.x * 36}px, ${vector.y * 36}px)` }} />
      </div>
      <div class="moves">
        <div class="moves-side">
          <button
            type="button"
            class={`move-btn move-distract${distracts > 0 ? "" : " is-waiting"}`}
            aria-disabled={distracts <= 0}
            aria-label={t("distractLeft", { n: distracts })}
            onPointerDown={(event) => {
              event.preventDefault();
              if (distracts > 0) send({ t: "distract" });
            }}
            onClick={(event) => {
              if (event.detail === 0 && distracts > 0) send({ t: "distract" });
            }}
          >
            <span>{t("distract")}</span>
            <b class="move-count tabular" aria-hidden="true">
              {distracts}
            </b>
          </button>
          <button
            type="button"
            class={`move-btn move-blend${blendReady ? "" : " is-waiting"}`}
            aria-disabled={!blendReady}
            onPointerDown={(event) => {
              event.preventDefault();
              if (blendReady) send({ t: "blend" });
            }}
            onClick={(event) => {
              if (event.detail === 0 && blendReady) send({ t: "blend" });
            }}
          >
            {t(blendReady ? "blend" : "wait")}
          </button>
        </div>
        <button
          type="button"
          class={`move-btn move-punch${punchReady ? "" : " is-waiting"}`}
          aria-disabled={!punchReady}
          aria-label={t("punch")}
          onPointerDown={(event) => {
            event.preventDefault();
            if (!punchReady) return;
            send({ t: "punch" });
            navigator.vibrate?.(24);
          }}
          onClick={(event) => {
            if (event.detail === 0 && punchReady) send({ t: "punch" });
          }}
        >
          {t(punchReady ? "punch" : "wait")}
        </button>
      </div>
    </div>
  );
}
