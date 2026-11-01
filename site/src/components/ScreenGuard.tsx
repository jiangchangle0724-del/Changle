import { Component, type ErrorInfo, type ReactNode } from "react";
import { isStaleBuild, loadingNewVersion, loadNewVersion } from "../lib/freshness";
import { useStore } from "../store";

type Props = { children: ReactNode; onHome?: () => void; compact?: boolean };
type State = { failed: boolean; stale: boolean };

/**
 * When something on a screen breaks, the rest of the app keeps going: a calm note with a way back
 * in place of the screen, instead of a blank page. (The error goes to the console for us.) When
 * what broke is a file of the site's that is gone because the site was updated, it opens the new
 * version instead; trying again then means loading the page afresh, as the old file won't come back.
 */
export class ScreenGuard extends Component<Props, State> {
  state: State = { failed: false, stale: false };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, stale: isStaleBuild(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("screen", error, info.componentStack);
    if (isStaleBuild(error) && loadNewVersion()) this.forceUpdate();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.stale && loadingNewVersion()) return <Updating compact={this.props.compact} />;
    const retry = () => (this.state.stale ? location.reload() : this.setState({ failed: false, stale: false }));
    return <Broken compact={this.props.compact} onRetry={retry} onHome={this.props.onHome} />;
  }
}

function Updating({ compact }: { compact?: boolean }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <div className={compact ? "broken broken-compact" : "screen notice-screen broken"} role="status">
      <div className="notice-body">
        <p className="notice-title">{zh ? "网站刚更新" : "The site was just updated"}</p>
        <p className="hint" style={{ textAlign: "center" }}>
          {zh ? "正在打开新版本……" : "Opening the new version…"}
        </p>
      </div>
    </div>
  );
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
