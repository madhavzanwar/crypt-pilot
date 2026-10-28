import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "finpilot" });

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/** Calls the FastAPI backend from a durable, retried step. Send "finpilot/backend.ping" to try it. */
export const backendPing = inngest.createFunction(
  { id: "backend-ping", triggers: [{ event: "finpilot/backend.ping" }] },
  async ({ step }) => {
    return step.run("GET /api/health", async () => {
      const res = await fetch(`${BACKEND}/api/health`);
      if (!res.ok) throw new Error(`backend health ${res.status}`);
      return res.json();
    });
  },
);

// Evidence Council stages live in backend/app/api/jobs_router.py; this file only decides the order and the parallelism.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function stage(name: string, body: Json): Promise<Json> {
  const res = await fetch(`${BACKEND}/api/jobs/evidence/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-job-token": process.env.INNGEST_JOB_TOKEN ?? "" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const CHECKERS = ["data_guardian", "duplicate_detector", "fraud_hunter", "merchant_verifier", "subscription_sleuth", "pattern_analyst"];

/**
 * Evidence Council as a multi-agent workflow. Send "finpilot/evidence.requested" with { user_id, run }
 * (POST /api/security/{user}/investigate-job does this). Every agent is its own step in Inngest's run timeline.
 */
export const evidenceCouncil = inngest.createFunction(
  { id: "evidence-council", triggers: [{ event: "finpilot/evidence.requested" }], concurrency: { limit: 3 } },
  async ({ event, step }) => {
    const { user_id, run } = event.data as { user_id: string; run: string };

    // 1. The six checking agents read the ledger in parallel.
    const checked = await Promise.all(
      CHECKERS.map((agent) => step.run(`check:${agent}`, () => stage("check", { run, user_id, agent }))),
    );

    // 2. Each agent's model second-guesses its own findings, seeing what the other agents found.
    const reviewed = await Promise.all(
      CHECKERS.map((agent, i) =>
        step.run(`review:${agent}`, () =>
          stage("review", { run, user_id, agent, findings: checked[i].findings, board: checked.filter((_, j) => j !== i).flatMap((c) => c.findings) }),
        ),
      ),
    );
    const summaries: Json[] = reviewed.map((r, i) => ({ agent: CHECKERS[i], findings: r.findings.length, ms: checked[i].ms + r.ms, ...r.extra }));
    let findings: Json[] = reviewed.flatMap((r) => r.findings);

    // 3. The rest depends on everything before it, so it runs in order.
    const web = await step.run("web_checker", () => stage("web", { run, findings }));
    findings = web.findings;
    summaries.push({ agent: "web_checker", findings: 0, ms: web.ms, ...web.extra });

    const scored = await step.run("risk_scorer", () => stage("score", { run, findings }));
    findings = scored.findings;
    summaries.push({ agent: "risk_scorer", findings: 0, ms: scored.ms, ...scored.extra });

    const verdict = await step.run("verdict_writer", () => stage("verdict", { run, findings, score: scored.score }));
    summaries.push({ agent: "verdict_writer", findings: 0, ms: verdict.ms, ...verdict.extra });

    return step.run("save_report", () =>
      stage("save", { run, user_id, findings, score: scored.score, summaries, verdict: verdict.verdict, source: verdict.source, error: verdict.error }),
    );
  },
);
