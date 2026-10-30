/**
 * Instant, offline "open <page>" understanding for voice (and typed) commands, in English, Hindi, Marathi and Hinglish.
 * It runs BEFORE the AI model, so opening a page never waits for (or fails with) a slow model.
 *
 * Rules: a command navigates when it names a page AND (starts with / contains a go-verb, or is just the page name).
 * Questions and tasks ("what is my budget", "add a goal to buy a car") are left to the AI.
 * When several pages match, the longest matching phrase wins ("risk council" beats "council", "wallet guard" beats "wallet").
 */

export interface NavTarget {
  path: string;
  label: string;
  /** a CSS selector to scroll to after the page opens */
  target?: string;
}

interface PageDef extends NavTarget {
  /** Latin-script phrases (English and romanised Hindi/Marathi). Matched on word boundaries. */
  words: string[];
  /** Devanagari phrases (Hindi, Marathi). Matched as substrings. */
  indic?: string[];
}

export const NAV_PAGES: PageDef[] = [
  { path: "/dashboard", label: "your dashboard", words: ["dashboard", "home", "home page", "homepage", "main page", "overview", "summary"], indic: ["डैशबोर्ड", "डॅशबोर्ड", "होम", "मुख्य पृष्ठ", "मुख्यपृष्ठ", "सारांश"] },
  { path: "/copilot", label: "the Copilot", words: ["copilot", "co pilot", "co-pilot", "finpilot", "assistant", "chat", "ask ai"], indic: ["कोपायलट", "को-पायलट", "कॉपायलट", "चैट", "सहायक"] },
  { path: "/wallet-guard", label: "Wallet Guard", words: ["wallet guard", "wallet", "wallets", "bitcoin", "btc", "crypto", "check wallet", "wallet check"], indic: ["वॉलेट गार्ड", "वॉलेट", "बिटकॉइन", "क्रिप्टो"] },
  { path: "/credits", label: "your credits", words: ["credit", "credits", "top up", "topup", "recharge", "buy checks", "buy credits"], indic: ["क्रेडिट", "रिचार्ज"] },
  { path: "/connect", label: "the Connectors page", words: ["connect", "connectors", "connector", "connections", "integrations", "link bank", "link account", "link my bank", "link my account", "data sources", "sources"], indic: ["कनेक्टर", "कनेक्ट", "जोड़ें"] },
  { path: "/transactions", label: "your transactions", words: ["transaction", "transactions", "payments", "payment history", "spending history", "history", "expenses", "expense list"], indic: ["लेनदेन", "ट्रांजैक्शन", "ट्रान्झॅक्शन", "व्यवहार", "खर्च"], target: "table tbody tr" },
  { path: "/upload", label: "Upload document", words: ["upload", "upload document", "upload statement", "import statement", "import", "scan document"], indic: ["अपलोड", "दस्तावेज़ अपलोड"] },
  { path: "/photos", label: "the receipt and expense page", words: ["photos", "photo", "receipt", "receipts", "scan receipt", "add expense", "quick expense"], indic: ["फोटो", "रसीद", "पावती"] },
  { path: "/budgets", label: "your budgets", words: ["budget", "budgets"], indic: ["बजट", "बजेट", "अर्थसंकल्प"] },
  { path: "/goals", label: "your goals", words: ["goal", "goals", "savings goal", "savings goals"], indic: ["लक्ष्य", "गोल", "ध्येय"] },
  { path: "/household", label: "your household", words: ["household", "family", "house hold", "family spending"], indic: ["परिवार", "कुटुंब", "फैमिली", "घरगुती"] },
  { path: "/simulate", label: "the Simulator", words: ["simulate", "simulator", "simulation", "what if", "what-if"], indic: ["सिमुलेटर", "सिम्युलेटर", "सिमुलेट"] },
  { path: "/plan", label: "your plan", words: ["plan", "my plan", "financial plan"], indic: ["योजना", "प्लान"] },
  { path: "/forecast-risk", label: "Forecast and Risk", words: ["forecast", "forecast and risk", "forecast & risk", "risk forecast", "prediction", "predictions", "cash flow forecast"], indic: ["पूर्वानुमान", "फोरकास्ट", "अंदाज"] },
  { path: "/scenarios", label: "Compare, Tax and Timeline", words: ["scenario", "scenarios", "compare", "comparison", "compare options"], indic: ["परिदृश्य", "तुलना"] },
  { path: "/tax", label: "your tax page", words: ["tax", "taxes", "income tax", "tax regime", "tax calculator"], indic: ["टैक्स", "आयकर", "कर प्रणाली"] },
  { path: "/timeline", label: "your timeline", words: ["timeline", "time line"], indic: ["टाइमलाइन", "कालरेषा"] },
  { path: "/statement", label: "your statement", words: ["statement", "statements", "report", "reports", "monthly report", "monthly statement", "health statement", "financial report"], indic: ["स्टेटमेंट", "रिपोर्ट", "अहवाल", "विवरण"] },
  { path: "/evidence-room", label: "the Evidence Council", words: ["evidence council", "evidence room", "evidence", "security intelligence", "fraud agents", "investigation", "investigate", "fraud check", "security", "security council"], indic: ["साक्ष्य", "एविडेंस", "सबूत", "पुरावा", "जांच", "सुरक्षा"] },
  { path: "/council", label: "the Risk Council", words: ["risk council", "council", "risk agents"], indic: ["रिस्क काउंसिल", "जोखिम परिषद", "काउंसिल"] },
  { path: "/twin", label: "the Twin Simulator", words: ["twin", "twin simulator", "digital twin", "twin sim"], indic: ["ट्विन"] },
  { path: "/financial-security", label: "Financial Security", words: ["financial security", "security score", "money security", "fraud score"], indic: ["वित्तीय सुरक्षा", "आर्थिक सुरक्षा"] },
  { path: "/security", label: "your security settings", words: ["security settings", "two factor", "two-factor", "mfa", "2fa", "authenticator", "login security"], indic: ["सुरक्षा सेटिंग"] },
  { path: "/my-data", label: "My Data", words: ["my data", "data export", "download my data", "privacy", "my information"], indic: ["मेरा डेटा", "माझा डेटा", "डेटा"] },
  { path: "/profile", label: "your profile", words: ["profile", "my profile", "account settings", "settings"], indic: ["प्रोफाइल", "प्रोफ़ाइल", "सेटिंग"] },
];

/** Verbs that mean "take me there". Latin ones need word boundaries, Devanagari ones are substrings. */
const GO_LATIN = ["open", "go to", "go", "goto", "show me", "show", "take me", "take me to", "navigate", "navigate to", "visit", "launch", "switch to", "view", "display", "bring up", "let me see", "i want to see", "i want to open", "pull up", "load", "see",
  "khol", "kholo", "kholiye", "kholna", "dikhao", "dikha", "dikhaiye", "jao", "chalo", "le chalo", "le jao", "ughad", "ughada", "dakhva", "dakhav"];
const GO_INDIC = ["खोल", "दिखा", "जाओ", "जाइए", "चलो", "ले चलो", "ले जाओ", "उघड", "दाखव", "जा "];
/** Question or task words: these belong to the AI, not to navigation (unless the sentence starts with an explicit go-verb). */
const TASK = /\b(what|whats|what's|why|when|who|which|how|how much|tell me|explain|calculate|add|create|make|set up|set|delete|remove|pay|send|transfer|change|update|rename|fill|buy|bought|spent|should i|can i|do i)\b/;
const TASK_INDIC = ["क्या", "कितना", "कितने", "क्यों", "कैसे", "बताओ", "बताइए", "जोड़ो", "जोडा", "हटाओ", "काय", "किती", "कसे", "सांगा"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LATIN_CACHE = new Map<string, RegExp>();
function hasWord(text: string, phrase: string): boolean {
  let re = LATIN_CACHE.get(phrase);
  if (!re) {
    re = new RegExp(`(^|[^a-z0-9])${escape(phrase).replace(/\s+/g, "\\s+")}($|[^a-z0-9])`);
    LATIN_CACHE.set(phrase, re);
  }
  return re.test(text);
}

function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(hey|hi|ok|okay|hello|please|pls|kindly|can you|could you|would you|will you|i want to|i would like to|i'd like to|for me|now|the|a|an|page|screen|section|tab)\b/g, " ")
    .replace(/[.,!?;:'"“”‘’()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function startsWithGo(t: string): boolean {
  return GO_LATIN.some((v) => t === v || t.startsWith(v + " ")) || GO_INDIC.some((v) => t.startsWith(v.trim()));
}

function hasGo(t: string): boolean {
  return GO_LATIN.some((v) => hasWord(t, v)) || GO_INDIC.some((v) => t.includes(v.trim()));
}

/** The page a spoken or typed command wants to open, or null if it is a question, a task, or names no page. */
export function matchNavigation(raw: string): NavTarget | null {
  const original = raw.toLowerCase();
  const t = normalise(raw);
  if (!t) return null;
  const wordCount = t.split(" ").length;
  const goStart = startsWithGo(t);
  const goAnywhere = goStart || hasGo(t);
  const isTask = TASK.test(original) || TASK_INDIC.some((w) => original.includes(w));
  if (isTask && !goStart) return null;
  if (!goAnywhere && wordCount > 3) return null; // a bare page name ("statement", "risk council") is fine, a long sentence is not

  let best: { page: PageDef; len: number } | null = null;
  for (const page of NAV_PAGES) {
    for (const w of page.words) if (hasWord(t, w) && (!best || w.length > best.len)) best = { page, len: w.length };
    for (const w of page.indic ?? []) if (original.includes(w) && (!best || w.length > best.len)) best = { page, len: w.length };
  }
  return best ? { path: best.page.path, label: best.page.label, target: best.page.target } : null;
}
