/**
 * The 12 shared components, as interfaces only. Codex card C1 builds them in src/ui/, one file each,
 * styled with the tokens in src/styles/tokens.css and nothing else. Rules: docs/DESIGN.md.
 *
 * Button, Tile, Sheet, Tabs, Pill, RosterChip, OTPInput, Toast, EmptyState, Skeleton, GameHeader, PenaltyCard.
 *
 * Text: whatever a player reads arrives through props, already in the reader's language. The two
 * exceptions: titles that show both languages at once take `T` ({ zh, en }), and the few labels a
 * component owns (close, back, loading) it carries in both languages and picks by `lang`.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { PenaltyCall as LivePenaltyCall } from "../components/PenaltyStamp";
import type { Lang, T } from "../i18n";

/** What kind of game or tool something is. Picks its type color (--type-* in tokens.css). */
export type Category = "drink" | "brain" | "body" | "online" | "tool";

/** Signal tones, shared by Pill, Toast and EmptyState. */
export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

type ButtonCommon = {
  onClick?: () => void;
  disabled?: boolean;
  /** waiting on the network: shows progress, ignores taps, keeps its width */
  busy?: boolean;
  /** "submit" inside a form; otherwise "button" (the default, so a tap never submits by accident) */
  type?: "button" | "submit";
};

/** Button 按钮: anything you tap to make something happen; one primary per screen. */
export type ButtonProps = ButtonCommon &
  (
    | {
        /** primary: the current game's color (white off a game); quiet: dusk; danger: Stop Red, for the move that sends someone to a penalty, or deletes */
        tone?: "primary" | "quiet" | "danger";
        /** md 50px (default); lg 60px, the main move on a stage; sm 44px where space is tight. Never under 44. */
        size?: "sm" | "md" | "lg";
        /** full width */
        block?: boolean;
        /** a leading icon */
        icon?: LucideIcon;
        children: ReactNode;
      }
    | {
        /** icon only: a 44px circle */
        tone: "icon";
        icon: LucideIcon;
        /** what a screen reader says, and the tooltip on desktop */
        label: string;
        /** a switch that stays pressed, like sound on */
        pressed?: boolean;
      }
  );

/** Tile 游戏卡: one game or tool in the grid, or the big card under "now play this". */
export type TileProps = {
  /** both names show; the reader's language leads */
  name: T;
  lang: Lang;
  icon: LucideIcon;
  /** its type color: cards are colored by kind, not one color per game (decided 2026-11-01) */
  category: Category;
  players?: { min: number; max: number };
  /** how long a round usually takes */
  minutes?: number;
  /** shows a glass mark; the home filters read it too */
  drinking?: boolean;
  /** the 新 / New tag; the caller stops passing it 30 days after launch */
  isNew?: boolean;
  /** not playable yet: dimmed */
  soon?: boolean;
  /** under the room light during a random pick */
  lit?: boolean;
  /** grid (default), or hero: the full-width card at the top of home */
  size?: "grid" | "hero";
  onOpen: () => void;
};

/** Sheet 弹层: a panel that rises from the bottom for menus, players, settings, rules and a game's intro. */
export type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** for its own close button's label */
  lang: Lang;
  children: ReactNode;
  /** actions that stay at the bottom while the body scrolls (the 玩这个 button) */
  footer?: ReactNode;
  /** the sheet takes this color for its primary button; a game's sheet passes the game's */
  category?: Category;
  gel?: string;
} & (
  | {
      /** the visible title, which also names the dialog for screen readers */
      title: ReactNode;
      label?: undefined;
    }
  | {
      title?: undefined;
      /** no visible title: this names the dialog */
      label: string;
    }
);

/** Tabs 标签页: switches between views of one page (home: games, tools, wishlist), or a pill-shaped choice. */
export type TabsProps<K extends string = string> = {
  items: {
    key: K;
    label: ReactNode;
    /** a smaller second line under the label */
    sub?: ReactNode;
    /** a count on the tab */
    badge?: number;
  }[];
  value: K;
  onChange: (key: K) => void;
  /** names the group for screen readers */
  label: string;
  /** tabs: switches what's below (tablist); segmented: picks one option (the pill group) */
  variant?: "tabs" | "segmented";
};

/** Pill 标签: a small rounded label (新, 2 到 8 人), or a filter chip you switch on and off. */
export type PillProps =
  | {
      kind?: "tag";
      children: ReactNode;
      tone?: Tone | Category;
      icon?: LucideIcon;
    }
  | {
      /** a filter chip: 44px tall, pressable, shows whether it's on */
      kind: "toggle";
      children: ReactNode;
      selected: boolean;
      onToggle: (selected: boolean) => void;
      tone?: Tone | Category;
      icon?: LucideIcon;
    };

/** RosterChip 玩家: one person at tonight's table, face and name, in the player bar and the players sheet. */
export type RosterChipProps = {
  name: string;
  /** for its own labels (remove, away) */
  lang: Lang;
  /** the face (today's <Avatar> or <SeatFace>); without one, the first letter on a color */
  face?: ReactNode;
  /** turn: bigger and ringed in the game's color; out: faded and struck through */
  state?: "idle" | "turn" | "out";
  /** drinks so far, as small dots */
  drinks?: number;
  /** online rooms: connected, gone for a moment, or left */
  presence?: "here" | "away" | "gone";
  host?: boolean;
  me?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  /** shows a remove button */
  onRemove?: () => void;
};

/** OTPInput 验证码: the 6-digit sign-in code, or a 4-letter table code, in separate boxes; typing, pasting and autofill all work. */
export type OTPInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** called once, when the last box fills */
  onComplete?: (value: string) => void;
  /** 6 for sign-in codes (default), 4 for table codes */
  length?: number;
  /** digits: the emailed code (number pad, one-time-code autofill); letters: a table code, uppercased */
  charset?: "digits" | "letters";
  /** names the field for screen readers (验证码) */
  label: string;
  /** shown under the boxes and read out */
  error?: ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
};

/** Toast 提示: a one-line message that comes and goes on its own (saved, copied, reconnected). */
export type ToastProps = {
  message: ReactNode;
  /** danger is read out at once; the rest wait their turn */
  tone?: Exclude<Tone, "accent">;
  /** one way to act on it: 撤销, 重试 */
  action?: { label: ReactNode; onClick: () => void };
  /** ms on screen: 4000 by default, 8000 when there's an action */
  duration?: number;
  onDismiss: () => void;
};

/** How a screen raises a toast. One at a time: a new one replaces the last. */
export type ShowToast = (message: ReactNode, options?: Omit<ToastProps, "message" | "onDismiss">) => void;

/** EmptyState 空状态: what a screen or list shows when it has nothing yet, or can't load, with one way forward. */
export type EmptyStateProps = {
  icon?: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  /** the one way forward: 加上今晚的人, 重试 */
  action?: { label: ReactNode; onClick: () => void };
  /** error: something failed (offline, code expired, no such table), said plainly, never as an error code */
  tone?: "neutral" | "error";
};

/** Skeleton 骨架屏: quiet shapes where content will land, so a screen is never blank while it loads. */
export type SkeletonProps = {
  /** for its own "loading" label */
  lang: Lang;
  /** line: text; block: a card; circle: a face; tile: a game card */
  shape?: "line" | "block" | "circle" | "tile";
  /** this many lines of text, the last one shorter */
  lines?: number;
  /** a layout size: px, or any CSS length */
  width?: number | string;
  height?: number | string;
  /** after this many ms a line of text shows under it (default 2000) */
  slowAfter?: number;
  /** what that line says, e.g. 还在加载，网有点慢 */
  slowText?: ReactNode;
};

/** GameHeader 游戏顶栏: the fixed 56px bar on every game screen: back, the game's name, round or time left, sound, TV view. */
export type GameHeaderProps = {
  title: T;
  lang: Lang;
  onBack: () => void;
  /** round 3 of 10, or seconds left (Stop Red from urgentAt down, default 10) */
  status?: { kind: "round"; current: number; total?: number } | { kind: "timer"; secondsLeft: number; urgentAt?: number };
  sound?: { on: boolean; onToggle: () => void };
  /** opens the TV view (?view=tv) */
  onTv?: () => void;
  /** opens the rules */
  onHelp?: () => void;
  /** one more icon button, only if a game truly needs it */
  extra?: ReactNode;
};

/** Same shape as PenaltyCall in components/PenaltyStamp.tsx, so games keep passing what they pass today. */
export type PenaltyCall = {
  /** who it lands on; empty for the whole table */
  who: string[];
  kind: "sip" | "two" | "full" | "everyone" | "safe";
  /** a line under the names, e.g. the rule that caused it */
  note?: string;
  /** the penalty itself when the game names one ("15 push-ups"), shown instead of the drink */
  say?: string;
};

/** Fails to compile if the two PenaltyCall shapes drift apart (drop it once PenaltyStamp is gone). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<_ extends true> = never;
export type PenaltyCallMatchesToday = Assert<Same<PenaltyCall, LivePenaltyCall>>;

/** PenaltyCard 惩罚卡: the one way every game hands out a penalty (a sip, 5 push-ups, a performance), same look and motion everywhere. */
export type PenaltyCardProps = {
  call: PenaltyCall | null;
  lang: Lang;
  onDone: () => void;
  /** stamp: today's full-screen slam, the loudest moment on any screen (default); card: a quiet card in a results list */
  presentation?: "stamp" | "card";
  /** online: the table's own penalty, set by the host */
  customText?: string;
  /** online: what this phone can do (I drank, call the buddy) instead of Continue */
  actions?: ReactNode;
};
