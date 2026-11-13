# T1: a group buy's orders as a CSV file

**Files:** `tools/tuan/src/engine/csv.ts` (new), `tools/tuan/tests/csv.test.ts` (new). Nothing else.
**Command:** in `tools/tuan`: `npx vitest run tests/csv.test.ts`, then `npm run typecheck` and `npm test`.

A merchant wants their orders in a spreadsheet: one row for every line of every order, so they
can sort, filter and add up in Excel, Numbers or Google Sheets. You write the function that turns
a group buy and its orders into the text of that file. Claude Code wires the button afterwards
(`src/client/ui/MyOffer.tsx`); don't.

Read first: `src/engine/types.ts` (`OfferBook`, `Order`, `OrderLine`, `Unit`, `How`,
`OrderStatus`), `src/engine/money.ts` (`lineAmount`, `amountText`), `src/engine/summary.ts`
(`dueOf`), `src/engine/time.ts` (`vancouverClock`), and `tests/sample.ts` (`sampleBook`: a group
buy to test with).

## What it exports

```ts
import type { How, OfferBook, Order, OrderStatus, Unit } from "./types";

/** The words the file is written in (the page gives them in the reader's language). */
export interface CsvWords {
  /** the 21 column names, in the order below */
  headers: readonly string[];
  status: Record<OrderStatus, string>;
  how: Record<How, string>;
  unit: Record<Unit, string>;
  /** what a ticked box says: "是", "yes" */
  yes: string;
}

/** The orders of a group buy as the text of a CSV file. */
export function ordersCsv(book: OfferBook, orders: readonly Order[], words: CsvWords): string;
```

## The rows

- The first row is `words.headers`, as given.
- Then every order **that isn't cancelled**, in the order of `seq`, and within an order its lines
  in the order they are in `order.lines`. One row a line.
- An order's own columns (5 to 10, and 17 to 21 below) are filled **only on that order's first
  row** and empty on its other rows, so a column added up in a spreadsheet counts each order once.
  Columns 1 to 4 are on every row, so a row still says whose it is after sorting.

| # | Column | What goes in it |
| --- | --- | --- |
| 1 | No. | `order.seq` |
| 2 | Code | `order.code` |
| 3 | Status | `words.status[order.status]` |
| 4 | Name | `order.name` |
| 5 | Phone | the digits of `order.phone`, grouped: 10 digits as `604-555-0188`; 11 digits starting with 1 as `1-604-555-0188`; anything else as the digits alone |
| 6 | WeChat | `order.wechat` |
| 7 | How | `words.how[order.how]` |
| 8 | Place | the pickup point's `name` (`book.points`, by `order.pickupId`) or the delivery area's `label` (`book.rules`, by `order.ruleId`); empty if it's no longer listed |
| 9 | Address | `order.address` (a delivery only; empty for a pickup) |
| 10 | Note | `order.note` |
| 11 | Item | `line.name` |
| 12 | Unit | `words.unit[line.unit]` |
| 13 | Price | `line.price` in dollars, two decimals, no sign: `38.00` |
| 14 | Amount | `line.qty` as `amountText` writes it: `2`, `1.5` |
| 15 | Weighed | `line.actual` the same way, or empty when it's null |
| 16 | Comes to | `lineAmount(line.price, line.actual ?? line.qty)` in dollars: `27.52` |
| 17 | Delivery | `order.fee` in dollars |
| 18 | To collect | `dueOf(order)` in dollars |
| 19 | Paid | `words.yes` when `order.paidAt` isn't null, else empty |
| 20 | Handed over | `words.yes` when `order.pickedAt` isn't null, else empty |
| 21 | Ordered | `vancouverClock(order.createdAt)`: `2026-11-13 15:26` |

## The file

- It starts with the byte-order mark `﻿` (without it Excel on Windows reads Chinese as
  nonsense), and every row ends with `\r\n`, the last one too.
- A field is wrapped in double quotes when it holds a comma, a double quote, a line break (`\n` or
  `\r`) or starts or ends with a space; a double quote inside is written twice. Other fields are
  written bare. (RFC 4180.)
- **Nothing a buyer typed may run as a formula.** A name, WeChat ID, address, note or item name
  that begins with `=`, `+`, `-`, `@`, a tab or a carriage return gets a single quote `'` put in
  front (then quoted as above if it needs to be). This is about columns 4, 6, 8, 9, 10 and 11:
  the other columns are made here and never begin with those.
- Dollars: `(cents / 100).toFixed(2)` is fine for whole cents; no `$`, no thousands separator.

## Tests (`tests/csv.test.ts`, vitest, like `tests/engine.test.ts`)

Build orders by hand on top of `sampleBook(now)` (give each line the item's `id`, `name`, `unit`
and `price` from the book). Check at least:

1. Two orders, one cancelled between them: the header, then only the standing ones, by `seq`.
2. An order with three lines: columns 5 to 10 and 17 to 21 filled on its first row, empty on the
   next two; columns 1 to 4 on all three.
3. A weighed line (`lb`) before and after `actual` is set: columns 14, 15, 16 and the order's 18.
4. A delivery with a fee, and one above the area's `freeFrom` (fee 0): columns 7, 8, 9, 17, 18.
5. A name `=HYPERLINK("http://x","y")`, a note with a comma, a quote and a line break, a WeChat
   ID `@abc`, an address starting with `-`: the exact text of those fields in the file.
6. Phones `6045550188`, `16045550188`, `8613800138000`.
7. The file starts with `﻿`, every row ends with `\r\n`, and every row has 21 fields (write
   a small CSV reader in the test to count them; don't count commas).
8. No orders at all: the header row alone.
9. Adding column 18 over all rows gives the same as adding `dueOf(order)` over the standing orders.

## Done when

The command passes, `npm run typecheck` and `npm test` pass, only the two files changed, and the
PR says what the file looks like for one small example (paste it).
