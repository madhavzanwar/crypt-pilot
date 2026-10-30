import { test } from "node:test";
import assert from "node:assert/strict";
import { validateExpense, isDeleteConfirmed, todayISO, namedTransfers, isWritable, describeDeleted } from "../lib/sharedExpenses.ts";

const ids = ["a", "b", "c"];
const ok = { title: "Groceries", amount: "450.50", paidBy: "a", split: ["a", "b"], date: "2026-10-29" };
const now = new Date(2026, 9, 30);

test("valid draft has no errors", () => assert.deepEqual(validateExpense(ok, ids, now), {}));

test("title, amount, payer, split and date rules match the contract", () => {
  assert.ok(validateExpense({ ...ok, title: "  " }, ids, now).title);
  assert.ok(validateExpense({ ...ok, title: "x".repeat(121) }, ids, now).title);
  for (const amount of ["", "0", "-5", "abc", "Infinity", "100000001"]) assert.ok(validateExpense({ ...ok, amount }, ids, now).amount, amount);
  assert.equal(validateExpense({ ...ok, amount: "100000000" }, ids, now).amount, undefined);
  assert.ok(validateExpense({ ...ok, paidBy: "zzz" }, ids, now).paidBy);
  assert.ok(validateExpense({ ...ok, split: [] }, ids, now).split);
  assert.ok(validateExpense({ ...ok, split: ["a", "zzz"] }, ids, now).split);
  assert.ok(validateExpense({ ...ok, date: "1999-12-31" }, ids, now).date);
  assert.ok(validateExpense({ ...ok, date: "not-a-date" }, ids, now).date);
  assert.equal(validateExpense({ ...ok, date: "2026-10-31" }, ids, now).date, undefined); // one day ahead is allowed
  assert.ok(validateExpense({ ...ok, date: "2026-11-02" }, ids, now).date);
});

test("delete confirmation is case-sensitive", () => {
  assert.equal(isDeleteConfirmed("DELETE"), true);
  for (const s of ["delete", "Delete", "DELET", "DELETE MY DATA", ""]) assert.equal(isDeleteConfirmed(s), false, s);
});

test("todayISO pads", () => assert.equal(todayISO(new Date(2026, 0, 5)), "2026-01-05"));

test("transfers get names; sample/read_only blocks writes", () => {
  const s = { household_id: "h", sample: false, read_only: false, members: [{ id: "a", name: "Rishi", kind: "user" }, { id: "b", name: "Priya", kind: "user" }],
    expenses: [], settlements: [], balances: [], transfers: [{ from: "a", to: "b", amount: 10 }] };
  assert.equal(namedTransfers(s)[0].fromName, "Rishi");
  assert.equal(isWritable(s), true);
  assert.equal(isWritable({ ...s, read_only: true }), false);
  assert.equal(isWritable({ ...s, sample: true }), false);
});

test("describeDeleted skips zeros", () => assert.deepEqual(describeDeleted({ transactions: 12, goals: 0, shared_expenses: 1 }), ["12 transactions", "1 shared expenses"]));
