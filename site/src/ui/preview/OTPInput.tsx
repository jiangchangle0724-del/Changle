import { useState } from "react";
import type { Lang } from "../../i18n";
import { OTPInput } from "../OTPInput";
export function OTPInputPreview({ lang }: { lang: Lang }) {
  const [digits, setDigits] = useState("");
  const [letters, setLetters] = useState("");
  const [errorValue, setErrorValue] = useState("123456");
  const [complete, setComplete] = useState("");
  return (
    <div className="ui-preview-section">
      <h2>{lang === "zh" ? "邮箱验证码" : "Email code"}</h2>
      <OTPInput
        value={digits}
        onChange={setDigits}
        onComplete={setComplete}
        label={lang === "zh" ? "验证码" : "Verification code"}
        autoFocus
      />
      <h2>{lang === "zh" ? "四位桌号" : "Four-letter table code"}</h2>
      <OTPInput
        value={letters}
        onChange={setLetters}
        length={4}
        charset="letters"
        label={lang === "zh" ? "桌号" : "Table code"}
      />
      <h2>{lang === "zh" ? "验证码已过期" : "Expired code"}</h2>
      <OTPInput
        value={errorValue}
        onChange={setErrorValue}
        label={lang === "zh" ? "重试验证码" : "Retry code"}
        error={
          lang === "zh"
            ? "验证码已过期，请重新获取后再试。"
            : "This code expired. Request a new code and try again."
        }
      />
      <OTPInput
        value="12"
        onChange={() => {}}
        disabled
        label={lang === "zh" ? "不可用验证码" : "Disabled code"}
      />
      <output className="ui-preview-output">
        {complete && `✓ ${complete}`}
      </output>
    </div>
  );
}
