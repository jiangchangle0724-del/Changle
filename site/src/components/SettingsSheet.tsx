import { Music, Volume2, VolumeX } from "lucide-react";
import { sfx, unlockAudio } from "../lib/sfx";
import { useStore } from "../store";
import { setSoundEnabled } from "../lib/sound";
import { Sheet } from "./Sheet";
import { LangTab } from "./TopBar";

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ui, lang, sound, setSound, music, setMusic, customPenalty, setCustomPenalty } = useStore();
  const previews: { zh: string; en: string; play: () => void }[] = [
    { zh: "喝！", en: "Drink!", play: () => sfx.stamp() },
    { zh: "答对", en: "Correct", play: () => sfx.correct() },
    { zh: "碰杯", en: "Cheers", play: () => sfx.clink() },
    { zh: "骰子", en: "Dice", play: () => sfx.dice() },
    { zh: "礼花", en: "Poppers", play: () => sfx.firecrackers() },
    { zh: "揭晓", en: "Reveal", play: () => sfx.reveal() },
    { zh: "倒酒", en: "Pour", play: () => sfx.pour(1) },
    { zh: "抢答", en: "Buzzer", play: () => sfx.buzz(2) },
    { zh: "鼓掌", en: "Applause", play: () => sfx.applause(2) },
  ];
  return (
    <Sheet open={open} onClose={onClose} title={ui("settings")}>
      <div className="settings-row">
        <span>{ui("language")}</span>
        <LangTab />
      </div>
      <div className="settings-row">
        <span>{ui("sound")}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-pressed={sound}
          onClick={() => {
            setSound(!sound);
            setSoundEnabled(!sound);
            if (!sound) {
              unlockAudio();
              window.setTimeout(() => sfx.clink(), 60);
            }
          }}
        >
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          {sound ? ui("soundOn") : ui("soundOff")}
        </button>
      </div>
      <div className="settings-row">
        <span className="stack" style={{ gap: 2 }}>
          {ui("music")}
          <span className="hint" style={{ fontSize: "var(--text-sm)" }}>
            {ui("musicHint")}
          </span>
        </span>
        <button type="button" className="btn btn-ghost btn-sm" aria-pressed={music} disabled={!sound} onClick={() => setMusic(!music)}>
          <Music size={16} />
          {music && sound ? ui("soundOn") : ui("soundOff")}
        </button>
      </div>
      {sound && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          <span>{ui("soundPreview")}</span>
          <div className="picker">
            {previews.map((p) => (
              <button
                key={p.zh}
                type="button"
                className="chip"
                onClick={() => {
                  unlockAudio();
                  p.play();
                }}
              >
                {lang === "zh" ? p.zh : p.en}
              </button>
            ))}
          </div>
          <p className="hint" style={{ fontSize: "var(--text-sm)" }}>
            {ui("silentHint")}
          </p>
        </div>
      )}
      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
        <span>{ui("penaltyCustom")}</span>
        <label className="field">
          <input
            value={customPenalty}
            onChange={(e) => setCustomPenalty(e.target.value)}
            placeholder={ui("penaltyCustomPlaceholder")}
            maxLength={24}
          />
        </label>
        <p className="hint">{ui("penaltyHelp")}</p>
      </div>
      <p className="hint" style={{ marginTop: 22 }}>
        {ui("adultsOnly")}
        {lang === "zh" ? "。" : ". "}
        {ui("responsible")}
      </p>
      {/* (in the hint color like the line above: fog on the sheet was 4.38:1, under the 4.5 text needs) */}
      <p className="hint" style={{ marginTop: 6 }}>
        {ui("madeBy")}
      </p>
    </Sheet>
  );
}
