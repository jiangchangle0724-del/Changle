import { Share2 } from "lucide-react";
import { CATS, ERAS, parsePool, SOURCES } from "../../shared/songs";
import { useStore } from "../../store";
import { useToast } from "../../ui/Toast";
import { challengeScore, challengeUrl, type Challenge } from "./challenge";
import { specialBy, specialName } from "./specials";

/** What a pool plays, in a few words: 华语、英文 · 90 年代, or 周杰伦专场. */
export function poolWords(pool: string, zh: boolean): string {
  const p = parsePool(pool);
  if (!p) return "";
  if (p.singer) {
    const s = specialBy(p.singer);
    const name = s ? specialName(s, zh) : p.singer;
    return zh ? `${name}专场` : `${name} special`;
  }
  const sep = zh ? "、" : ", ";
  const parts = [SOURCES.filter((x) => p.srcs.includes(x.key)).map((x) => (zh ? x.zh : x.en)).join(sep)];
  if (p.cats.length) parts.push(CATS.filter((c) => p.cats.includes(c.key)).map((c) => (zh ? c.zh : c.en)).join(sep));
  if (p.eras.length) parts.push(ERAS.filter((e) => p.eras.includes(e.key)).map((e) => (zh ? e.zh : e.en)).join(sep));
  return parts.join(" · ");
}

/** How the challenge plays, in one line: 8 首 · 选择题 · 一秒猜歌 · 华语、英文. */
export function challengeWords(c: Challenge, songs: number, zh: boolean) {
  return [
    zh ? `${songs} 首` : `${songs} songs`,
    c.quiz ? (zh ? "选择题" : "Multiple choice") : zh ? "抢答" : "Shout it out",
    ...(c.quiz && c.hard ? [zh ? "难：只写歌名" : "Hard titles"] : []),
    ...(c.snap ? [zh ? "一秒猜歌" : "One second"] : []),
    poolWords(c.pool, zh),
  ].join(" · ");
}

/**
 * A friend's challenge, before taking it on: who, how it plays, the score to beat. `found`: the songs
 * this phone has (null while the list loads): the score to beat counts only those.
 */
export function ChallengeIntro({ c, found }: { c: Challenge; found: number[] | null }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const who = c.name || (zh ? "朋友" : "A friend");
  const have = found ?? c.ids;
  const bar = c.ids.reduce((a, id, i) => a + (have.includes(id) ? c.pts[i] : 0), 0);
  if (found && !found.length)
    return (
      <section className="tn-challenge" aria-labelledby="tn-challenge-title">
        <h2 id="tn-challenge-title">{zh ? `${who}向你发起挑战` : `${who} challenges you`}</h2>
        <p className="tn-pool-hint">{zh ? "可惜这个挑战的歌已经不在歌单里了。自己选一组歌玩吧。" : "Sadly, this challenge's songs aren't in the list any more. Pick some songs of your own."}</p>
      </section>
    );
  return (
    <section className="tn-challenge" aria-labelledby="tn-challenge-title">
      <h2 id="tn-challenge-title">{zh ? `${who}向你发起挑战` : `${who} challenges you`}</h2>
      <p className="tn-challenge-how">{challengeWords(c, have.length, zh)}</p>
      <p className="tn-challenge-bar">
        <strong className="tabular">{bar}</strong>
        <span>{zh ? `${who}的分数，满分 ${have.length * 3}` : `${who}'s score, out of ${have.length * 3}`}</span>
      </p>
      <p className="tn-pool-hint">
        {zh
          ? c.quiz
            ? "同样的歌，同样的四个选项。一个人或一桌人都能玩，最高分去比。"
            : "同样的歌，喊出歌名，再点是谁猜对的。一个人或一桌人都能玩，最高分去比。"
          : c.quiz
            ? "The same songs, the same four titles. Alone or with the table: your best score takes it on."
            : "The same songs: shout the title, then tap who got it. Alone or with the table: your best score takes it on."}
      </p>
    </section>
  );
}

/** After a challenge: the table's best against the score it set out to beat. */
export function ChallengeResult({ c, ids, best }: { c: Challenge; ids: number[]; best: { name: string; score: number } }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const who = c.name || (zh ? "朋友" : "Your friend");
  // (songs this phone no longer has were left out: theirs count only on the ones played here)
  const theirs = c.ids.reduce((a, id, i) => a + (ids.includes(id) ? c.pts[i] : 0), 0);
  const line = best.score > theirs ? (zh ? "挑战成功" : "You beat it") : best.score === theirs ? (zh ? "打平了" : "A tie") : zh ? "差一点" : "Not this time";
  return (
    <section className={`tn-challenge tn-challenge-result ${best.score > theirs ? "is-won" : ""}`} aria-labelledby="tn-challenge-result">
      <h2 id="tn-challenge-result">{line}</h2>
      <div className="tn-challenge-vs">
        <p>
          <strong className="tabular">{best.score}</strong>
          <span>{best.name}</span>
        </p>
        <p>
          <strong className="tabular">{theirs}</strong>
          <span>{who}</span>
        </p>
      </div>
    </section>
  );
}

/**
 * Send a game on as a challenge: the phone's share sheet, or the link copied; when neither works,
 * `onLink` gets it to show (press and hold to copy).
 */
export function ShareChallenge({ c, primary, onLink }: { c: Challenge; primary?: boolean; onLink: (url: string) => void }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const toast = useToast();
  const send = async () => {
    const url = challengeUrl(c);
    const score = challengeScore(c);
    const text = zh ? `猜歌名：${c.ids.length} 首歌我拿了 ${score} 分，来挑战！` : `Name That Tune: ${score} points on ${c.ids.length} songs. Beat that!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: zh ? "猜歌名挑战" : "Name That Tune challenge", text, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast(zh ? "挑战链接复制好了，发给朋友吧" : "Challenge link copied. Send it to a friend.", { tone: "success" });
    } catch {
      onLink(url);
    }
  };
  return (
    <button type="button" className={`btn btn-lg btn-block ${primary ? "btn-primary" : "btn-ghost"}`} onClick={() => void send()}>
      <Share2 size={18} />
      {zh ? "发起挑战" : "Challenge a friend"}
    </button>
  );
}

/** A challenge's link to copy by hand, when the phone would neither share nor copy it. */
export function ChallengeLink({ url }: { url: string }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  return (
    <label className="field tn-challenge-link">
      <input readOnly value={url} aria-label={zh ? "挑战链接，长按复制" : "The challenge link: press and hold to copy"} onFocus={(e) => e.currentTarget.select()} />
    </label>
  );
}
