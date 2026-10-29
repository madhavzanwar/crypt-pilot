"use client";

import { translate, useLang } from "@/lib/i18n";
import type { Lang } from "@/lib/crypto/api";
import { MR } from "./copy.mr";
import { toRequestLang } from "@/lib/crypto/lang";

/**
 * Wallet Guard strings, English + Hindi (+ Marathi in ./copy.mr.ts). Looked up here first (FinPilot's own i18n table has no wallet-guard rows), then through FinPilot's `translate(lang, key, default)`.
 * `{name}` placeholders are filled from the `vars` argument.
 */
const COPY: Record<string, [string, string]> = {
  "wg.title": ["Wallet Guard", "वॉलेट गार्ड"],
  "wg.sub": [
    "Paste a Bitcoin address before you send. We look it up in a transaction graph and explain the risk in plain words.",
    "भेजने से पहले बिटकॉइन पता यहाँ डालें। हम इसे लेन-देन ग्राफ में खोजकर जोखिम सरल शब्दों में समझाते हैं।",
  ],
  "wg.input.label": ["Bitcoin wallet address", "बिटकॉइन वॉलेट पता"],
  "wg.input.placeholder": ["Paste a public address (bc1…, 1…, 3…)", "पब्लिक पता डालें (bc1…, 1…, 3…)"],
  "wg.input.valid": ["Format looks valid", "फ़ॉर्मेट सही लग रहा है"],
  "wg.input.err.format": ["That does not look like a Bitcoin address.", "यह बिटकॉइन पता नहीं लगता।"],
  "wg.input.err.mixed": [
    "Mixed upper and lower case: please check the address.",
    "बड़े और छोटे अक्षर मिले हुए हैं: कृपया पता जाँचें।",
  ],
  "wg.input.err.checksum": [
    "The address checksum does not match: there is probably a typo. Please copy it again.",
    "पते का चेकसम मेल नहीं खाता: शायद टाइपिंग की गलती है। कृपया दोबारा कॉपी करें।",
  ],
  "wg.input.paste": ["Paste", "पेस्ट करें"],
  "wg.input.clear": ["Clear", "साफ़ करें"],
  "wg.examples": ["Try an example", "उदाहरण आज़माएँ"],
  "wg.examples.loading": ["Loading examples…", "उदाहरण लोड हो रहे हैं…"],
  "wg.check": ["Check wallet", "वॉलेट जाँचें"],
  "wg.checking": ["Checking…", "जाँच हो रही है…"],
  "wg.check.cost": ["Uses 1 credit. Repeats within 10 minutes are free.", "1 क्रेडिट लगता है। 10 मिनट में दोबारा जाँच मुफ़्त है।"],
  "wg.secret.title": ["That looks like a secret key or seed phrase.", "यह सीक्रेट की या सीड फ्रेज़ जैसा लगता है।"],
  "wg.secret.body": [
    "Never share it with anyone. Wallet Guard only needs a public address, so we cleared the field and sent nothing.",
    "इसे किसी को न बताएँ। वॉलेट गार्ड को सिर्फ़ पब्लिक पता चाहिए, इसलिए हमने फ़ील्ड खाली कर दिया और कुछ नहीं भेजा।",
  ],
  "wg.progress.title": ["Checking this wallet", "इस वॉलेट की जाँच"],
  "wg.progress.aria": ["Check in progress", "जाँच जारी है"],
  "wg.progress.cancel": ["Cancel", "रद्द करें"],
  "wg.step.validate": ["Validating address", "पता जाँचा जा रहा है"],
  "wg.step.graph": ["Querying the graph", "ग्राफ में खोज"],
  "wg.step.hops": ["Measuring hops to flagged wallets", "फ़्लैग किए वॉलेट तक दूरी नापना"],
  "wg.step.score": ["Scoring risk", "जोखिम का स्कोर"],
  "wg.step.explain": ["Writing the explanation", "व्याख्या लिखना"],
  "wg.error.title": ["The check did not finish", "जाँच पूरी नहीं हुई"],
  "wg.error.retry": ["Try again", "फिर कोशिश करें"],
  "wg.error.credits.title": ["You are out of checks", "आपके चेक खत्म हो गए"],
  "wg.error.credits.cta": ["Add credits", "क्रेडिट जोड़ें"],
  "wg.error.invalid.title": ["Check the address", "पता जाँचें"],
  "wg.empty.title": ["Your result will appear here", "आपका नतीजा यहाँ दिखेगा"],
  "wg.empty.body": [
    "Pick an example or paste an address. You will get a verdict, a 0 to 100 risk score, the reasons, and the wallets around it.",
    "कोई उदाहरण चुनें या पता डालें। आपको निर्णय, 0 से 100 का जोखिम स्कोर, कारण और आस-पास के वॉलेट दिखेंगे।",
  ],
  "wg.honesty": [
    "Risk signal from a research dataset (Elliptic++), not an accusation. Not in the dataset does not mean safe.",
    "यह रिसर्च डेटासेट (Elliptic++) से जोखिम का संकेत है, आरोप नहीं। डेटासेट में न होने का मतलब सुरक्षित नहीं है।",
  ],

  // verdict
  "wg.verdict.ALLOW": ["Allow", "आगे बढ़ें"],
  "wg.verdict.WARN": ["Warn", "सावधान"],
  "wg.verdict.BLOCK": ["Block", "रोकें"],
  "wg.verdict.UNKNOWN": ["Unknown", "अज्ञात"],
  "wg.verdict.ALLOW.line": [
    "No flagged wallets close by in the dataset.",
    "डेटासेट में आस-पास कोई फ़्लैग किया वॉलेट नहीं मिला।",
  ],
  "wg.verdict.WARN.line": [
    "Some risk signals nearby. Look closer before you send.",
    "आस-पास कुछ जोखिम संकेत हैं। भेजने से पहले ध्यान से देखें।",
  ],
  "wg.verdict.BLOCK.line": [
    "Strong risk signals. Do not send funds unless you can verify the other side.",
    "जोखिम के मज़बूत संकेत हैं। सामने वाले की पुष्टि किए बिना पैसे न भेजें।",
  ],
  "wg.verdict.UNKNOWN.line": [
    "This wallet is not in our dataset, so we cannot say anything about it.",
    "यह वॉलेट हमारे डेटासेट में नहीं है, इसलिए हम इसके बारे में कुछ नहीं कह सकते।",
  ],
  "wg.unknown.notsafe": ["Not in our dataset does not mean safe.", "डेटासेट में न होने का मतलब सुरक्षित नहीं है।"],
  "wg.announce": ["{verdict} for this wallet. Risk score {score} out of 100.", "इस वॉलेट के लिए {verdict}। जोखिम स्कोर 100 में से {score}।"],
  "wg.announce.na": ["{verdict}: this wallet is not in the dataset.", "{verdict}: यह वॉलेट डेटासेट में नहीं है।"],

  // gauge + facts
  "wg.gauge.label": ["Risk score", "जोखिम स्कोर"],
  "wg.gauge.na": ["n/a", "लागू नहीं"],
  "wg.gauge.value": ["{n} out of 100", "100 में से {n}"],
  "wg.gauge.low": ["Low", "कम"],
  "wg.gauge.high": ["High", "ज़्यादा"],
  "wg.hops.title": ["Nearest flagged wallet", "सबसे पास का फ़्लैग वॉलेट"],
  "wg.hops.one": ["1 hop away", "1 कदम दूर"],
  "wg.hops.other": ["{n} hops away", "{n} कदम दूर"],
  "wg.hops.none": ["None within 3 hops", "3 कदम के भीतर कोई नहीं"],
  "wg.hits.title": ["Sanction and ransomware lists", "प्रतिबंध और रैनसमवेयर सूचियाँ"],
  "wg.hits.match": ["Match", "मिलान"],
  "wg.hits.nomatch": ["No match", "मिलान नहीं"],
  "wg.hits.ofac.yes": ["OFAC list: match", "OFAC सूची: मिलान"],
  "wg.hits.ofac.no": ["OFAC list: no match", "OFAC सूची: मिलान नहीं"],
  "wg.hits.rw.yes": ["Ransomwhere: match", "Ransomwhere: मिलान"],
  "wg.hits.rw.no": ["Ransomwhere: no match", "Ransomwhere: मिलान नहीं"],
  "wg.dataset.label": ["Dataset label: {label}", "डेटासेट लेबल: {label}"],
  "wg.label.illicit": ["illicit", "अवैध"],
  "wg.label.licit": ["licit", "वैध"],
  "wg.label.unknown": ["unknown", "अज्ञात"],
  "wg.reasons.title": ["Why this verdict", "यह निर्णय क्यों"],
  "wg.neighbours.title": ["Wallets around it", "आस-पास के वॉलेट"],
  "wg.neighbours.hop": ["Hop {n}", "कदम {n}"],
  "wg.neighbours.illicit": ["Illicit", "अवैध"],
  "wg.neighbours.licit": ["Licit", "वैध"],
  "wg.neighbours.unknown": ["Unknown", "अज्ञात"],
  "wg.neighbours.na": ["Not computed", "गणना नहीं हुई"],
  "wg.limits.title": ["Limitations", "सीमाएँ"],
  "wg.credits.left": ["{n} credits left", "{n} क्रेडिट बाकी"],
  "wg.credits.cached": ["Served from cache: no credit used.", "कैश से मिला: कोई क्रेडिट नहीं लगा।"],
  "wg.credits.reused": ["Shown from your last check: no credit used.", "आपकी पिछली जाँच से दिखाया गया: कोई क्रेडिट नहीं लगा।"],
  "wg.notice.mock": ["Synthetic or mock data: these are not real wallets.", "नकली या मॉक डेटा: ये असली वॉलेट नहीं हैं।"],
  "wg.notice.replay": ["Replay: a saved real response, not a live check.", "रीप्ले: सहेजा हुआ असली जवाब, लाइव जाँच नहीं।"],
  "wg.notice.truncated": [
    "This wallet is very connected, so only part of its neighbourhood is shown.",
    "यह वॉलेट बहुत जुड़ा हुआ है, इसलिए इसके आस-पास का सिर्फ़ एक हिस्सा दिखाया गया है।",
  ],
  "wg.model": ["Model", "मॉडल"],

  // engine
  "wg.engine.tigergraph": ["Graph query answered by TigerGraph in {ms} ms", "ग्राफ क्वेरी का जवाब TigerGraph ने {ms} ms में दिया"],
  "wg.engine.networkx": ["Graph engine: NetworkX · {ms} ms", "ग्राफ इंजन: NetworkX · {ms} ms"],
  "wg.engine.replay": ["Graph answer: pre-recorded replay", "ग्राफ का जवाब: पहले से रिकॉर्ड किया हुआ रीप्ले"],
  "wg.engine.other": ["Graph engine: {name} · {ms} ms", "ग्राफ इंजन: {name} · {ms} ms"],
  "wg.engine.example": ["Example data", "उदाहरण डेटा"],
  "wg.gsql.view": ["View GSQL", "GSQL देखें"],
  "wg.gsql.hide": ["Hide GSQL", "GSQL छिपाएँ"],

  // explanation
  "wg.explain.title": ["Explanation", "व्याख्या"],
  "wg.explain.basis": ["Based only on retrieved evidence", "सिर्फ़ मिले हुए सबूतों पर आधारित"],
  "wg.explain.tab.en": ["English", "English"],
  "wg.explain.tab.hi": ["हिन्दी", "हिन्दी"],
  "wg.explain.listen": ["Listen", "सुनें"],
  "wg.explain.pause": ["Pause", "रोकें"],
  "wg.explain.voicenote": ["Voice may sound different on your device.", "आवाज़ आपके डिवाइस पर अलग लग सकती है।"],
  "wg.explain.insufficient": ["Insufficient evidence: we cannot say anything about this wallet.", "पर्याप्त सबूत नहीं: हम इस वॉलेट के बारे में कुछ नहीं कह सकते।"],

  // graph
  "wg.graph.title": ["Evidence graph", "सबूतों का ग्राफ"],
  "wg.graph.depth.label": ["Hop depth", "कदम की गहराई"],
  "wg.graph.depth.n": ["{n} hop", "{n} कदम"],
  "wg.graph.depth.nn": ["{n} hops", "{n} कदम"],
  "wg.graph.zoomin": ["Zoom in", "ज़ूम इन"],
  "wg.graph.zoomout": ["Zoom out", "ज़ूम आउट"],
  "wg.graph.reset": ["Fit to view", "पूरा दिखाएँ"],
  "wg.graph.pause": ["Pause animation", "एनिमेशन रोकें"],
  "wg.graph.play": ["Play animation", "एनिमेशन चलाएँ"],
  "wg.graph.path": ["Highlight path to nearest flagged wallet", "सबसे पास के फ़्लैग वॉलेट तक का रास्ता दिखाएँ"],
  "wg.graph.path.found": ["Shortest path to a flagged wallet: {n} hops.", "फ़्लैग वॉलेट तक सबसे छोटा रास्ता: {n} कदम।"],
  "wg.graph.path.none": ["No flagged wallet in view.", "दिखाए गए हिस्से में कोई फ़्लैग वॉलेट नहीं।"],
  "wg.graph.aria": ["Graph of {n} wallets around the checked wallet. A text list follows.", "जाँचे गए वॉलेट के आस-पास {n} वॉलेट का ग्राफ। नीचे सूची भी है।"],
  "wg.graph.showing": ["Showing {shown} of {total} wallets (nearest first).", "{total} में से {shown} वॉलेट दिखाए गए (सबसे पास वाले पहले)।"],
  "wg.graph.empty.title": ["No graph to show", "दिखाने के लिए कोई ग्राफ नहीं"],
  "wg.graph.empty.body": ["There are no neighbouring wallets in the dataset for this address.", "इस पते के लिए डेटासेट में कोई पड़ोसी वॉलेट नहीं है।"],
  "wg.graph.legend": ["Legend", "संकेत"],
  "wg.graph.legend.subject": ["Checked wallet", "जाँचा गया वॉलेट"],
  "wg.graph.legend.illicit": ["Illicit (diamond)", "अवैध (हीरा)"],
  "wg.graph.legend.licit": ["Licit (circle)", "वैध (गोला)"],
  "wg.graph.legend.unknown": ["Unknown (square)", "अज्ञात (चौकोर)"],
  "wg.graph.legend.arrow": ["Direction of funds", "पैसे की दिशा"],
  "wg.graph.counts": ["Hop {n}: {illicit} illicit, {licit} licit, {unknown} unknown", "कदम {n}: {illicit} अवैध, {licit} वैध, {unknown} अज्ञात"],
  "wg.graph.list": ["Graph as a list", "ग्राफ सूची के रूप में"],
  "wg.graph.list.wallet": ["Wallet", "वॉलेट"],
  "wg.graph.list.label": ["Label", "लेबल"],
  "wg.graph.list.hop": ["Hop", "कदम"],
  "wg.graph.list.subject": ["checked wallet", "जाँचा गया वॉलेट"],
  "wg.node.title": ["Wallet details", "वॉलेट की जानकारी"],
  "wg.node.close": ["Close details", "जानकारी बंद करें"],
  "wg.node.copy": ["Copy address", "पता कॉपी करें"],
  "wg.node.copied": ["Copied", "कॉपी हुआ"],
  "wg.node.label": ["Dataset label", "डेटासेट लेबल"],
  "wg.node.hop": ["Hops from checked wallet", "जाँचे वॉलेट से कदम"],
  "wg.node.risk": ["Node risk score", "वॉलेट का जोखिम स्कोर"],
  "wg.node.why.subject": ["This is the wallet you checked.", "यह वही वॉलेट है जिसे आपने जाँचा।"],
  "wg.node.why.illicit": ["The dataset labels this wallet illicit. Being close to it raises the risk score.", "डेटासेट इस वॉलेट को अवैध मानता है। इसके पास होना जोखिम स्कोर बढ़ाता है।"],
  "wg.node.why.licit": ["The dataset labels this wallet licit (for example an exchange or service).", "डेटासेट इस वॉलेट को वैध मानता है (जैसे एक्सचेंज या सेवा)।"],
  "wg.node.why.unknown": ["The dataset has no label for this wallet.", "डेटासेट में इस वॉलेट का कोई लेबल नहीं है।"],

  // inline card
  "wg.card.open": ["Open in Wallet Guard", "वॉलेट गार्ड में खोलें"],
  "wg.card.checking": ["Checking this wallet…", "इस वॉलेट की जाँच हो रही है…"],
  "wg.card.hops.short": ["Nearest flagged: {n} hop(s)", "सबसे पास फ़्लैग: {n} कदम"],
  "wg.card.hops.none": ["No flagged wallet within 3 hops", "3 कदम में कोई फ़्लैग वॉलेट नहीं"],
};

/** Looks a key up in the Wallet Guard table; falls back to FinPilot's i18n, then the key. */
export function gt(lang: string, key: string, vars?: Record<string, string | number>): string {
  const row = COPY[key];
  const idx = lang === "hi" || lang === "mr" ? 1 : 0; // Marathi falls back to the Hindi column when ./copy.mr.ts lacks a key
  let text = (lang === "mr" ? MR[key] : undefined) ?? (row ? row[idx] || row[0] : translate(lang as Parameters<typeof translate>[0], key));
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Hook form: `g(key, vars)` in the current UI language. */
export function useGuardT(): { g: (key: string, vars?: Record<string, string | number>) => string; uiLang: string; reqLang: Lang } {
  const uiLang = useLang();
  return {
    g: (key, vars) => gt(uiLang, key, vars),
    uiLang,
    /** Language to request from the service: Hindi when the UI is Hindi, English otherwise. */
    reqLang: toRequestLang(uiLang),
  };
}

export const verdictWord = (lang: string, v: string): string => gt(lang, `wg.verdict.${v}`);
