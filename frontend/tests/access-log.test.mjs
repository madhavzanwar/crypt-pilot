// node --experimental-strip-types --test tests/access-log.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { describeAccess } from "../lib/accessLog.ts";
test("humanises raw method/path entries", () => {
  assert.equal(describeAccess({ method: "POST", path: "/api/upload/demo-priya", detail: "" }), "Added or updated a bank statement");
  assert.equal(describeAccess({ method: "GET", path: "/api/budgets/u1", detail: "" }), "Viewed your budgets");
  assert.equal(describeAccess({ method: "DELETE", path: "/api/goals/u/1" }), "Removed your goals");
  assert.equal(describeAccess({ method: "GET", path: "/zzz" }), "Viewed your data");
  assert.equal(describeAccess({ method: "GET", path: "/x", detail: "Exported all your data" }), "Exported all your data");
});
