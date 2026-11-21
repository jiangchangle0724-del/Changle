/**
 * 额头便利贴's pictures, made with ChatGPT's image tool (Steve's account, 2026-11-05), no words in
 * any of them: a sticker for every deck, the friends round the one with the phone on their forehead
 * (the curtain before each turn), notes bursting out of a cup (the results) and a pad of notes (the
 * online game's writing). WebP with see-through backgrounds; each loads only on the screen that
 * shows it, never with the home page.
 */
import cheer from "./art/cheer.webp";
import curtain from "./art/curtain.webp";
import pad from "./art/pad.webp";

const decks = import.meta.glob<string>("./art/decks/*.webp", { eager: true, query: "?url", import: "default" });

/** A deck's sticker by its id ("mix" is the online game's mixed bag); none for an id without one. */
export const deckArt = (id: string): string | undefined => decks[`./art/decks/${id}.webp`];

export const ART = { cheer, curtain, pad };
