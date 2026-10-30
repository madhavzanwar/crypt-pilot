import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../lib/apiError.ts", import.meta.url), "utf8");
const m = src.match(/export function extractErrorMessage[\s\S]*?\n}\n/)[0].replace("export function", "function").replace(/\(status: number, detail: string\): string/, "(status, detail)");
const extractErrorMessage = new Function(`${m}; return extractErrorMessage;`)();
test("extract errors", () => {
  assert.match(extractErrorMessage(429, "rate limit exceeded: 5 per 1 minute"), /wait a minute/);
  assert.match(extractErrorMessage(503, ""), /unavailable/);
  assert.equal(extractErrorMessage(422, "No rows found in that CSV."), "No rows found in that CSV.");
  assert.doesNotMatch(extractErrorMessage(422, ""), /photo should show/i);
});
