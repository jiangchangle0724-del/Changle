import { Component, type ErrorInfo, type ReactNode } from "react";
import { useStore } from "../store";

type Props = { children: ReactNode; onHome?: () => void; compact?: boolean };

/**
 * When something on a screen breaks, the rest of the app keeps going: a calm note with a way back
 * in place of the screen, instead of a blank page. (The error goes to the console for us.)
 */
export class ScreenGuard extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("screen", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <Broken compact={this.props.compact} onRetry={() => this.setState({ failed: false })} onHome={this.props.onHome} />;
  }
}

function Broken({ onRetry, onHome, compact }: { onRetry: () => void; onHome?: () => void; compact?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className={compact ? "broken broken-compact" : "screen notice-screen broken"} role="alert">
      <div className="notice-body">
        <p className="notice-title">{zh ? "这里出了点问题" : "Something went wrong here"}</p>
        <p className="hint" style={{ textAlign: "center" }}>
          {zh ? "再试一次一般就好了。" : "Trying again usually sorts it out."}
        </p>
        <div className="stack" style={{ gap: 10, width: "100%" }}>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onRetry}>
            {zh ? "再试一次" : "Try again"}
          </button>
          {onHome && (
            <button type="button" className="btn btn-ghost btn-block" onClick={onHome}>
              {zh ? "回首页" : "Home"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
