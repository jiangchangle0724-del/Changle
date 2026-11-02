import { readFileSync } from "node:fs";
import { parseGolden, score, formatReport, readSources, type StoredEvent } from "../src/eval";
import { SOURCES } from "../src/sources";

function dumpEvents(dump: unknown): StoredEvent[] {
  const value = Array.isArray(dump) && dump.length && "results" in Object(dump[0]) ? dump[0] : dump;
  const rows = Array.isArray(value) ? value : (value as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object"
    || !["id", "source", "url", "title", "start_at"].every((key) => typeof row[key] === "string")
    || !["all_day", "time_tbd"].every((key) => typeof row[key] === "boolean" || row[key] === 0 || row[key] === 1)
    || !["venue_name", "venue_address", "venue_area", "category", "duplicate_of"].every((key) => row[key] === null || typeof row[key] === "string"))) {
    throw new Error("Expected a stored-event array, { results: [...] }, or [{ results: [...] }]");
  }
  return rows as StoredEvent[];
}

try {
  if (process.argv.length !== 3) throw new Error("Usage: npm run eval -- <dump.json>");
  const golden = parseGolden(readFileSync(new URL("../golden/golden.csv", import.meta.url), "utf8"));
  const stored = dumpEvents(JSON.parse(readFileSync(process.argv[2], "utf8")));
  console.log(formatReport(score(golden, stored, readSources(SOURCES.map((s) => s.id)))));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Evaluation failed");
  process.exitCode = 1;
}
