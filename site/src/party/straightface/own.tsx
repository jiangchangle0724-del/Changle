/**
 * 自己出题: the form a player writes their own word in (one phone: passed round before the game;
 * online: every phone before the deal). What they write stays in this game only: never stored,
 * never counted, never in the bank.
 */
import { PenLine } from "lucide-react";
import { useState } from "react";
import { OWN_LIMITS } from "../../shared/straightface/engine";
import type { OwnDraft } from "../../shared/straightface/types";
import { useSay } from "./parts";
import { S } from "./text";

/** A player's word: the word, what it really means, and (if they like) where it comes from. */
export function OwnForm({ draft, onSave, onSkip, skipLabel }: { draft?: OwnDraft | null; onSave: (d: OwnDraft) => void; onSkip?: () => void; skipLabel?: string }) {
  const say = useSay();
  const [term, setTerm] = useState(draft?.term ?? "");
  const [definition, setDefinition] = useState(draft?.definition ?? "");
  const [fact, setFact] = useState(draft?.fact ?? "");
  const ready = term.trim() !== "" && definition.trim() !== "";
  return (
    <form
      className="panel sf-panel stack sf-own"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSave({ term: term.trim(), definition: definition.trim(), fact: fact.trim() });
      }}
    >
      <p className="sf-own-title">
        <PenLine size={20} aria-hidden="true" /> {say(S.ownTitle)}
      </p>
      <p className="hint">{say(S.ownLead)}</p>
      <label className="sf-own-field">
        <span className="field-label">{say(S.ownTerm)}</span>
        <span className="field">
          <input value={term} onChange={(e) => setTerm(e.target.value)} maxLength={OWN_LIMITS.term} placeholder={say(S.ownTermHint)} autoComplete="off" enterKeyHint="next" />
        </span>
      </label>
      <label className="sf-own-field">
        <span className="field-label">{say(S.ownMeaning)}</span>
        <span className="field">
          <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} maxLength={OWN_LIMITS.definition} rows={3} placeholder={say(S.ownMeaningHint)} />
        </span>
      </label>
      <label className="sf-own-field">
        <span className="field-label">{say(S.ownFact)}</span>
        <span className="field">
          <textarea value={fact} onChange={(e) => setFact(e.target.value)} maxLength={OWN_LIMITS.fact} rows={2} />
        </span>
      </label>
      <div className="row sf-own-actions">
        {onSkip && (
          <button type="button" className="btn btn-ghost btn-lg" onClick={onSkip}>
            {skipLabel ?? say(S.ownSkip)}
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-lg" disabled={!ready}>
          {say(S.ownSave)}
        </button>
      </div>
    </form>
  );
}
