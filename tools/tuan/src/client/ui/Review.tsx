// The site's owner answering applications to open a shop, at the top of their home (/tuan/my): each
// one as it would read on its shop's page, with what the merchant told the owner alone, and three
// answers. Approve opens the shop at once; send back says what to change; decline may say why. The
// merchant who asked hears of each by mail (the server sends it).
import { useState } from "preact/hooks";
import type { Application } from "../../api";
import { BASE } from "../../base";
import { ApiFail, answerApplication } from "../api";
import { t, whenText } from "../i18n";
import { Lines } from "./common";

const kindWord = (kind: Application["shop"]["kind"]) => t(kind === "kitchen" ? "kindKitchen" : kind === "farm" ? "kindFarm" : "kindLeader");

function Fact({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div class="fact">
      <h4>{label}</h4>
      <Lines text={text} />
    </div>
  );
}

function One({ application, onChange }: { application: Application; onChange: () => void }) {
  const { shop } = application;
  const [step, setStep] = useState<"accept" | "return" | "decline" | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function answer() {
    if (!step) return;
    if (step === "return" && !reply.trim()) return setProblem(t("reviewErrReply"));
    setBusy(true);
    setProblem(null);
    try {
      await answerApplication(shop.slug, step === "accept" ? { do: "accept" } : { do: step, reply });
      setStep(null);
      onChange();
    } catch (e) {
      const code = e instanceof ApiFail ? e.code : "failed";
      setProblem(t(code === "reply" ? "reviewErrReply" : code === "decided" ? "reviewErrDecided" : code === "network" ? "netDown" : "editErrFailed"));
      if (code === "decided") onChange();
    }
    setBusy(false);
  }

  const choose = (next: typeof step) => {
    setStep(next);
    setProblem(null);
  };
  return (
    <article class="stack">
      <div class="row-between">
        <h3 class="review-name">{shop.name}</h3>
        {application.state === "returned" && <span class="chip">{t("reviewSentBack")}</span>}
      </div>
      <p class="hint">
        {kindWord(shop.kind)} · {`changle.ca${BASE}/s/${shop.slug}`}
        <br />
        {application.email} · {whenText(application.sentAt)}
      </p>
      <Fact label={t("ownerAbout")} text={shop.about} />
      <Fact label={t("ownerContact")} text={shop.contact} />
      <Fact label={t("ownerPay")} text={shop.pay} />
      <Fact label={t("shopPermitField")} text={shop.permit} />
      <Fact label={t("reviewNote")} text={application.note} />
      {application.state === "returned" && <Fact label={t("reviewReturn")} text={application.reply} />}

      {step === null ? (
        <div class="row">
          <button type="button" class="btn btn-primary btn-sm" onClick={() => choose("accept")}>
            {t("reviewAccept")}
          </button>
          <button type="button" class="btn btn-quiet btn-sm" onClick={() => choose("return")}>
            {t("reviewReturn")}
          </button>
          <button type="button" class="btn btn-quiet btn-sm" onClick={() => choose("decline")}>
            {t("reviewDecline")}
          </button>
        </div>
      ) : (
        <form
          class="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void answer();
          }}
        >
          {step === "accept" ? (
            <p>{t("reviewAcceptAsk")}</p>
          ) : (
            <label class="field">
              <span class="field-label">{t(step === "return" ? "reviewReturnHint" : "reviewDeclineHint")}</span>
              <textarea
                name="reply"
                rows={3}
                maxLength={300}
                value={reply}
                onInput={(event) => {
                  setReply(event.currentTarget.value);
                  setProblem(null);
                }}
              />
            </label>
          )}
          {problem && (
            <p class="problem" role="alert">
              {problem}
            </p>
          )}
          <div class="row">
            <button type="submit" class={`btn btn-sm ${step === "decline" ? "btn-danger" : "btn-primary"}`} disabled={busy}>
              {t(step === "accept" ? "reviewAcceptYes" : step === "return" ? "reviewReturn" : "reviewDeclineYes")}
            </button>
            <button type="button" class="btn btn-quiet btn-sm" disabled={busy} onClick={() => choose(null)}>
              {t("reviewNo")}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

/** The applications waiting for the owner, then those sent back and not yet sent again. */
export function Review({ applications, onChange }: { applications: Application[]; onChange: () => void }) {
  return (
    <section class="panel" aria-labelledby="review-title">
      <h2 class="panel-title" id="review-title">
        {t("reviewTitle", { n: applications.length })}
      </h2>
      {applications.map((application) => (
        <One key={application.shop.slug} application={application} onChange={onChange} />
      ))}
    </section>
  );
}
