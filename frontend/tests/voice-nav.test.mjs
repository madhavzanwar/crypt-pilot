import test from "node:test";
import assert from "node:assert/strict";

const { matchNavigation } = await import("@/lib/voiceNav");
const go = (s) => matchNavigation(s)?.path ?? null;

test("every page opens by name in English", () => {
  const cases = {
    "open statement": "/statement", "open the monthly report": "/statement", "show me my reports": "/statement",
    "go to dashboard": "/dashboard", "take me home": "/dashboard", "open budgets": "/budgets", "show my goals": "/goals",
    "open transactions": "/transactions", "go to household": "/household", "open the plan": "/plan", "open tax": "/tax",
    "open forecast and risk": "/forecast-risk", "open simulator": "/simulate", "open timeline": "/timeline", "compare scenarios": "/scenarios",
    "open evidence council": "/evidence-room", "open security intelligence": "/evidence-room", "go to security": "/evidence-room",
    "open risk council": "/council", "open twin simulator": "/twin", "open financial security": "/financial-security",
    "open security settings": "/security", "open my data": "/my-data", "open profile": "/profile",
    "open wallet guard": "/wallet-guard", "open credits": "/credits", "open connectors": "/connect", "upload a document": "/upload",
    "open copilot": "/copilot", "go to the receipt page": "/photos",
  };
  for (const [say, path] of Object.entries(cases)) assert.equal(go(say), path, say);
});

test("polite and bare phrasing works", () => {
  assert.equal(go("hey finpilot, please open the statement page"), "/statement");
  assert.equal(go("can you take me to the risk council"), "/council");
  assert.equal(go("statement"), "/statement");
  assert.equal(go("risk council"), "/council");
});

test("the most specific page wins", () => {
  assert.equal(go("open risk council"), "/council");
  assert.equal(go("open evidence council"), "/evidence-room");
  assert.equal(go("open wallet guard"), "/wallet-guard");
  assert.equal(go("open financial security"), "/financial-security");
});

test("Hindi, Marathi and Hinglish commands", () => {
  assert.equal(go("स्टेटमेंट खोलो"), "/statement");
  assert.equal(go("बजट दिखाओ"), "/budgets");
  assert.equal(go("डैशबोर्ड खोलिए"), "/dashboard");
  assert.equal(go("एविडेंस काउंसिल खोलो"), "/evidence-room");
  assert.equal(go("रिस्क काउंसिल खोलो"), "/council");
  assert.equal(go("बजेट दाखवा"), "/budgets");
  assert.equal(go("स्टेटमेंट उघडा"), "/statement");
  assert.equal(go("statement kholo"), "/statement");
  assert.equal(go("budget dikhao"), "/budgets");
  assert.equal(go("dashboard khol do"), "/dashboard");
});

test("questions and tasks are left to the AI", () => {
  for (const s of ["what is my budget", "how much did I spend on food", "add a goal to buy a car", "create a budget for travel", "tell me about my statement",
    "I bought tea for 15 rupees", "pay my credit card", "why is my score low", "बजट क्या है", "my savings this month"]) {
    assert.equal(go(s), null, s);
  }
});

test("a command that names no page is not navigation", () => {
  assert.equal(go("open sesame"), null);
  assert.equal(go("hello there how are you today my friend"), null);
  assert.equal(go(""), null);
});
