// QA2-6: debt labels never show raw UUIDs; interest savings are a gain, lost cash flow a loss.
import test from "node:test";
import assert from "node:assert/strict";
import { debtLabel, impactTone } from "../components/statement/statementText.ts";

test("debtLabel uses the account name, never a UUID", () => {
  const accts = [{ id: "233c1851-54e9-4f1f-8658-a1686835e7da", name: "Car Loan - HDFC Auto" }];
  assert.equal(debtLabel("233c1851-54e9-4f1f-8658-a1686835e7da", accts), "Car Loan - HDFC Auto");
  assert.equal(debtLabel("7259934e-254d-42aa-aff2-c3064ee36cba", accts), "Loan account");
  assert.equal(debtLabel("car_loan", []), "car loan");
});

test("impactTone", () => {
  assert.equal(impactTone("total interest paid over remaining term", -9833), "gain");
  assert.equal(impactTone("monthly free cash flow", 1490), "gain");
  assert.equal(impactTone("monthly free cash flow", -300), "loss");
  assert.equal(impactTone("monthly 'dining' spend", -500), "gain");
  assert.equal(impactTone("health score", 0), "neutral");
});
