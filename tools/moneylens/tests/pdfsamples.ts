/**
 * A statement in PDF made up for the tests (SEC-12, IMP-9): a credit card's, laid out like the first real statement
 * the PDF reader met, as its invented copy showed it. The labels and where things stand are the layout's; every name,
 * number and line is made up here, so that its sums add up. Read in tests/pdfstatement.test.ts, and through the built
 * page in scripts/check-page.ts.
 */
import type { MadeRun } from "./pdfmake";

/** Helvetica's widths, in thousandths of the type's size, for what amounts are written with; a letter is taken as an average one. */
export const WIDE: Readonly<Record<string, number>> = { " ": 278, ".": 278, ",": 278, "-": 333, "(": 333, ")": 333, "+": 584, $: 556, C: 722, R: 722, D: 722 };
export const width = (text: string, size: number): number => ([...text].reduce((n, c) => n + (WIDE[c] ?? 556), 0) * size) / 1000;
export const tenth = (n: number): number => Math.round(n * 10) / 10;
/** A run for `makePdf`, and one that ends at `edge` as a column of amounts does. */
export const at = (text: string, x: number, y: number, size = 9): MadeRun => ({ text, x, y, size });
export const ending = (text: string, edge: number, y: number, size = 9): MadeRun => ({ text, x: tenth(edge - width(text, size)), y, size });

/** Where the card's table has its amounts end, and the summary its figures. */
export const AMOUNTS = 400.8;
export const FIGURES = 353.9;

export const CARD_SUMMARY: MadeRun[] = [
  at("ABC Sample Mastercard", 52.7, 34.1, 17),
  at("A SAMPLE", 376.5, 80.7),
  at("Summary of your account", 79.8, 86.2, 13),
  at("Card number", 376.5, 92.5),
  at("XXXX XXXX XXXX 4821", 505, 92.5),
  at("Previous total balance, Sep. 14, 2026", 79.8, 106.4),
  ending("$250.00", FIGURES, 106.4),
  at("Statement date", 376.5, 104.3),
  at("Oct. 14, 2026", 544, 104.3),
  at("Payments and credits", 79.8, 117.6),
  ending("250.00", FIGURES - 15, 117.6),
  at("Statement period", 376.5, 116.2),
  at("Sep. 15, 2026 - Oct. 14, 2026", 479.9, 116.2),
  at("Purchases and other charges", 79.8, 128.8),
  ending("+112.37", FIGURES - 15, 128.8),
  at("Cash advances", 79.8, 151.2),
  at("1", 142.8, 148.2, 5.2),
  ending("0.00", FIGURES - 15, 151.1),
  at("Total interest charges", 79.8, 162.3),
  ending("0.00", FIGURES - 15, 162.3),
  at("Fees", 79.8, 173.5),
  ending("0.00", FIGURES - 15, 173.5),
  at("Total balance", 79.8, 186.8),
  ending("$112.37", FIGURES - 15, 186.8),
  at("Minimum payment due", 79.8, 200.8),
  ending("$10.00", FIGURES - 15, 200.8),
  at("Payment due date: Nov. 9, 2026", 79.8, 234.4),
  at("Total installments not yet due", 79.8, 247.6),
  ending("0.00", FIGURES - 15, 247.6),
  at("Balance due", 79.8, 262.3),
  ending("$112.37", FIGURES - 15, 262.3),
  at("Your credit limit", 79.8, 291.5),
  ending("$2,000.00", FIGURES - 15, 291.5),
  // small print that names a balance and an amount, in sentences
  at("If your total balance is over your credit limit, you pay $29.00 more this month.", 79.8, 343.7, 8),
  at("Your new balance for purposes of interest is worked out daily. A fee of $5.00 applies.", 79.8, 351.7, 8),
  at("Page", 525.4, 534.4, 10),
  at("1", 551.6, 534.4, 10),
  at("of 2", 559.9, 534.4, 10),
  at("Balance due", 376.5, 585.9),
  ending("$112.37", 586.5, 585.9),
];

export const CARD_TABLE: MadeRun[] = [
  at("ABC Sample Mastercard", 52.7, 26.7, 14),
  at("Card number: XXXX XXXX XXXX 4821", 53.6, 52.7),
  at("Transactions since your last statement", 53.6, 100.7, 13),
  at("TRANS", 53.6, 112.6, 6),
  at("POSTING", 87.6, 112.6, 6),
  at("DATE", 53.6, 118.6, 6),
  at("DATE", 87.6, 118.6, 6),
  at("DESCRIPTION", 141.9, 118.3, 6),
  ending("AMOUNT ($)", AMOUNTS, 118.3, 6),
  at("Card number:", 53.6, 131, 7),
  at("XXXX XXXX XXXX 4821", 99.1, 131, 7),
  at("A SAMPLE", 184.3, 131, 7),
  at("Sep. 15 Sep. 16", 53.6, 146),
  at("CAFE MAPLE #12", 141.9, 146),
  at("VANCOUVER", 265.9, 146),
  at("BC", 324.4, 146),
  ending("4.50", AMOUNTS, 146),
  at("Sep. 20 Sep. 22", 53.6, 159.2),
  at("NORTH SHORE GROCER", 141.9, 159.2),
  at("BURNABY", 265.9, 159.2),
  at("BC", 314.4, 159.2),
  ending("82.17", AMOUNTS, 159.2),
  at("Sep. 28 Sep. 29", 53.6, 172.5),
  at("PAYMENT RECEIVED - THANK YOU", 141.9, 172.5),
  ending("250.00 CR", AMOUNTS + 16, 172.5),
  at("Sep. 30 Oct. 2", 53.6, 185.8),
  at("ACME WIDGETS OF NOVA SCOTIA", 141.9, 185.8),
  at("DARTMOUTH", 310, 185.8),
  ending("14.95", AMOUNTS, 185.8),
  at("NS", 141.9, 194.8),
  at("Oct. 3 Oct. 5", 53.6, 208.1),
  at("ONLINE STORE 4500 1234 5678 9012", 141.9, 208.1),
  ending("10.75", AMOUNTS, 208.1),
  at("Subtotal for A SAMPLE", 53.6, 223.4),
  ending("112.37", AMOUNTS, 223.4),
  at("Total for card number XXXX XXXX XXXX 4821", 53.6, 237.6),
  ending("$112.37", AMOUNTS, 237.6),
  at("Pre-authorized debit is in effect. The payment will be withdrawn from your bank account on Nov. 9, 2026", 53.6, 375.2, 8),
  at("Page", 525.5, 772.1, 10),
  at("2", 551.6, 772.1, 10),
  at("of 2", 559.9, 772.1, 10),
];
