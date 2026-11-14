/**
 * 导出账目, from the ⋯ sheet: the ledger as a CSV file (csv.ts says what is in it), with a line on
 * what a spreadsheet will show. Where the phone's share sheet takes files it goes there (to Files, to
 * mail, to a chat); a computer saves it. WeChat's own browser can do neither: there the sheet says how
 * to open 两清 in the phone's browser instead.
 */
import { CircleAlert, Download, Share } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Lang } from "../i18n";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import type { Ledger } from "./core";
import { csvOf } from "./csv";
import { canShareFile, datedName, inWeChat, saveFile, shareFile } from "./share";
import { say } from "./words";

export function ExportSheet({ open, onClose, ledger, lang }: { open: boolean; onClose: () => void; ledger: Ledger; lang: Lang }) {
  /** the phone said it could take the file, then didn't (not just closed by its owner): it is saved instead */
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (open) setRefused(false);
  }, [open]);
  // made while the sheet is open, of the ledger as it is
  const file = useMemo(() => (open && ledger.entries.some((e) => e.gone === undefined) ? new File([csvOf(ledger, lang)], datedName(Date.now(), "csv"), { type: "text/csv" }) : null), [open, ledger, lang]);
  const weChat = inWeChat();
  const shareable = !!file && !refused && canShareFile(file);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      category="tool"
      title={say(lang, "export")}
      footer={
        file &&
        !weChat &&
        (shareable ? (
          <Button size="lg" block icon={Share} onClick={async () => (await shareFile(file)) === "refused" && setRefused(true)}>
            {say(lang, "exportShare")}
          </Button>
        ) : (
          <Button size="lg" block icon={Download} onClick={() => saveFile(file)}>
            {say(lang, "exportSave")}
          </Button>
        ))
      }
    >
      {!file ? (
        <p className="split-note">{say(lang, "exportEmpty")}</p>
      ) : (
        <div className="split-export">
          <p>{say(lang, "exportBody")}</p>
          {weChat && (
            <p className="split-sync is-loud">
              <CircleAlert aria-hidden="true" />
              {say(lang, "exportWeChat")}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
