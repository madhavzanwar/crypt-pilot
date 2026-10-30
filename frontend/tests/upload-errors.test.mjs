// node --experimental-strip-types --test tests/upload-errors.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { extractErrorMessage, formatApiError } from "../lib/apiError.ts";
test("extract errors", () => {
  assert.match(extractErrorMessage(429, "rate limit exceeded: 5 per 1 minute"), /wait a minute/);
  assert.match(extractErrorMessage(503, ""), /unavailable/);
  assert.equal(extractErrorMessage(422, "No rows found in that CSV."), "No rows found in that CSV.");
  assert.doesNotMatch(extractErrorMessage(422, ""), /photo should show/i);
});
test("502 shows backend detail and sharing hint", () => {
  const m = formatApiError(502, JSON.stringify({ detail: "Could not read the sheet.", hint: "Share it as Anyone with the link can view." }));
  assert.equal(m, "Could not read the sheet. Share it as Anyone with the link can view.");
  assert.match(formatApiError(500, "boom"), /Something went wrong/);
});
import { validateTargetDate } from "../lib/validate.ts";
test("goal target date must not be in the past", () => {
  const now = new Date(2026, 9, 30, 12);
  assert.equal(validateTargetDate("", now), null);
  assert.equal(validateTargetDate("2026-10-30", now), null);
  assert.equal(validateTargetDate("2027-01-01", now), null);
  assert.match(validateTargetDate("2020-01-01", now), /past/);
  assert.match(validateTargetDate("garbage", now), /valid/);
});
