// The rooms server's door for mail (site/worker/mail.ts and notice.ts): the named entrypoint `Mail`,
// bound here as MAIL. The Resend key lives on the rooms server alone. What goes in and what comes
// back are copied from there; if that door changes, this changes with it. 两清's reminders are one
// of the notices it lets go to someone with no account there (notice.ts, TO_ANYONE): they say which
// account asked (`by`), and a reply goes to that account's email.

export interface Notice {
  /** which app is asking: the rooms server keeps a day's allowance for each (20 a day for this one, by the UTC day) */
  app: "split";
  /** whoever the reminder is for: any address */
  to: string;
  /** the changle.ca account that asked for it (its id): a reply goes to its email */
  by: string;
  /** one line, up to 120 characters */
  subject: string;
  /** plain text, up to 2,000 characters */
  text: string;
  /** a page on changle.ca, shown as the mail's button (the ledger's 查看链接) */
  link?: string;
  /** the language of the frame around the text */
  lang: "zh" | "en";
}

/** It went out; today's allowance is used up (don't try again today); it didn't go out, and why. */
export type Sent = { status: "sent" } | { status: "full" } | { status: "failed"; why: string };

export interface MailDoor {
  send(notice: Notice): Promise<Sent>;
}

/** (The binding is a service to this Worker's types: the method is the other Worker's.) */
export const doorOf = (mail: unknown): MailDoor => mail as MailDoor;
