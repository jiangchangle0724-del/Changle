// The rooms server's door for mail (site/worker/mail.ts and notice.ts): the named entrypoint `Mail`,
// bound here as MAIL. The Resend key lives on the rooms server alone. What goes in and what comes
// back are copied from there; if that door changes, this changes with it.

export interface Notice {
  /** which app is asking: the rooms server keeps a day's allowance for each (60 a day for this one, by the UTC day) */
  app: "tuan";
  /** the sign-in email of a changle.ca account: nobody else gets mail from the door */
  to: string;
  /** one line, up to 120 characters */
  subject: string;
  /** plain text, up to 2,000 characters */
  text: string;
  /** a page on changle.ca, shown as the mail's button */
  link?: string;
  /** the language of the frame around the text */
  lang: "zh" | "en";
}

/** It went out; today's allowance is used up (don't try again today); it didn't go out, and why. */
export type Sent = { status: "sent" } | { status: "full" } | { status: "failed"; why: string };

export interface MailDoor {
  send(notice: Notice): Promise<Sent>;
}

/** (`wrangler types` knows the binding only as a service: the method is the other Worker's.) */
export const doorOf = (env: Env): MailDoor => env.MAIL as unknown as MailDoor;

/** Reasons that won't get better by trying again: the notice itself, or its recipient, is not something the door takes. */
export const forGood = (why: string): boolean => ["app", "to", "subject", "text", "link", "lang"].includes(why);
