import test from "node:test";
import assert from "node:assert/strict";

// Stale-while-revalidate GET cache in lib/api.ts: fresh = no network, stale = instant + one quiet refetch, writes clear it.
let calls = 0;
let body = { n: 1 };
globalThis.fetch = async () => {
  calls++;
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
};
let now = 1_000_000;
const realNow = Date.now;
Date.now = () => now;

const { api, clearApiCache } = await import("@/lib/api");

test("a second GET inside the fresh window makes no network request", async () => {
  clearApiCache();
  calls = 0;
  await api.budgets("demo-x");
  now += 30_000;
  await api.budgets("demo-x");
  assert.equal(calls, 1);
});

test("a stale entry is returned immediately and refreshed once in the background", async () => {
  clearApiCache();
  calls = 0;
  body = { n: 1 };
  await api.budgets("demo-y");
  now += 120_000; // older than FRESH (60 s), younger than STALE (10 min)
  body = { n: 2 };
  const first = await api.budgets("demo-y");
  assert.deepEqual(first, { n: 1 }, "served the stale copy at once");
  await api.budgets("demo-y"); // second call while refreshing must not start another fetch
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, 2, "exactly one background refetch");
  assert.deepEqual(await api.budgets("demo-y"), { n: 2 }, "the refreshed copy replaced it");
});

test("an entry older than the stale window is fetched fresh", async () => {
  clearApiCache();
  calls = 0;
  body = { n: 1 };
  await api.budgets("demo-z");
  now += 11 * 60_000;
  body = { n: 3 };
  assert.deepEqual(await api.budgets("demo-z"), { n: 3 });
  assert.equal(calls, 2);
});

test("clearApiCache forces a new request", async () => {
  clearApiCache();
  calls = 0;
  await api.budgets("demo-w");
  clearApiCache();
  await api.budgets("demo-w");
  assert.equal(calls, 2);
});

test.after(() => {
  Date.now = realNow;
});
