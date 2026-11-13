# when-C4: the words people paste into the group chat

**Files:** `tools/when/src/engine/copy.ts` (new) and `tools/when/tests/copy.test.ts` (new).
**Command:** `npx tsx --test tests/copy.test.ts`

**Not before A3.** The owning chat (工具 · 约时间) checks this card against the finished A2 first
and says when to start; A2 already has one plain result line of its own, which this card replaces.

约时间 can't send a notification from a web page in WeChat, so it gives people words to paste:
an invitation when the gathering is made, a nudge for those who haven't answered, the result when
the time is set. Each comes in three tones and two languages, and the host picks the tone.

## Output

```ts
import type { Day, Lang, Part } from "./types";

export type Tone = "plain" | "easy" | "funny"; // 正经、轻松、搞笑

export type InviteWords = { title: string; url: string; days: Day[]; deadline?: number };
export type NudgeWords = { title: string; url: string; missing: string[]; deadline?: number };
export type ResultWords = { title: string; url: string; day: Day; part: Part; coming: number; asked: number; maybe: string[] };

/** `pick` chooses among the variants of one tone (0, 1, 2, …), so a second nudge reads differently. */
export function inviteText(words: InviteWords, tone: Tone, lang: Lang, pick?: number): string;
export function nudgeText(words: NudgeWords, tone: Tone, lang: Lang, pick?: number): string;
export function resultText(words: ResultWords, tone: Tone, lang: Lang, pick?: number): string;
```

Day and part names come from `src/engine/slots.ts` (`dayLabel`, `partLabel`): don't format dates
here.

## The words

- At least three variants for each of the nine (three kinds × three tones), in each language:
  54 lines or more. Chinese and English are written separately, not translated word for word.
- Each text is one message for a WeChat group: the title, what to do, the link on its own last
  line. At most 70 Chinese characters or 220 English characters before the link.
- The result says the day and part, how many of how many can come, and names whoever is a maybe:
  `定了，周六晚上，8 个人里 7 个有空，阿May 可以调。`
- A nudge names the people still missing when there are five or fewer; more than five, it says
  how many. It never scolds anyone by name.
- Plain reads like a note from an organised friend. Easy is how friends talk in a group chat.
  Funny is a light joke about scheduling itself (calendars, group chats that go quiet); never
  about a person, a group of people, drinking, money or anyone's family.
- No emoji in plain; at most one in easy and funny. No exclamation marks in a row.
- Names and titles go in exactly as typed (they can hold any characters).

## Done when

- The test fills every variant with a title and names that contain `，` `"` and an emoji, and
  checks each text holds the title, the link as its last line, and stays inside the length limit.
- `pick` beyond the last variant wraps around; the same input always gives the same text.
- The PR lists all the lines in a table (kind, tone, language) for the owning chat to read: the
  words are signed off there, line by line, before the merge.
- `npm run typecheck` and `npm test` pass.
