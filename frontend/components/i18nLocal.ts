"use client";

import { translate, useLang, type Lang, LANGS } from "@/lib/i18n";

/**
 * Component-level strings that lib/i18n.ts does not carry yet (sidebar, top-bar title, command palette, ...).
 * Same row shape as lib/i18n.ts: [en, hi, mr]. A key found here wins; otherwise the shared dictionary is used.
 * When these keys are moved into lib/i18n.ts this file can shrink to nothing: `useT` below is a drop-in for it.
 */
const L: Record<string, [string, string, string]> = {
  // sidebar / top-bar page titles
  "nav.Forecast & Risk": ["Forecast & Risk", "पूर्वानुमान और जोखिम", "अंदाज आणि जोखीम"],
  "nav.Simulate": ["Simulate", "सिमुलेशन", "सिम्युलेशन"],
  "nav.Evidence Council": ["Evidence Council", "साक्ष्य परिषद", "पुरावा परिषद"],
  "nav.Risk Council": ["Risk Council", "जोखिम परिषद", "जोखीम परिषद"],
  "nav.Twin Simulator": ["Twin Simulator", "ट्विन सिमुलेटर", "ट्विन सिम्युलेटर"],
  "nav.More": ["More", "और देखें", "आणखी"],
  "nav.Upload document": ["Upload document", "दस्तावेज़ अपलोड करें", "दस्तऐवज अपलोड करा"],
  "nav.Financial Security": ["Financial Security", "वित्तीय सुरक्षा", "आर्थिक सुरक्षा"],
  "nav.Plan": ["Plan", "योजना", "योजना"],
  "nav.Compare, Tax & Timeline": ["Compare, Tax & Timeline", "तुलना, कर और समयरेखा", "तुलना, कर आणि कालरेखा"],
  "nav.My Data": ["My Data", "मेरा डेटा", "माझा डेटा"],
  "nav.Profile": ["Profile", "प्रोफ़ाइल", "प्रोफाइल"],
  "nav.FinPilot home": ["FinPilot home", "फिनपायलट होम", "फिनपायलट होम"],
  "nav.Skip": ["Skip to main content", "मुख्य सामग्री पर जाएं", "मुख्य मजकुरावर जा"],

  // command palette
  "cmd.aria": ["FinPilot Command Palette", "फिनपायलट कमांड पैलेट", "फिनपायलट कमांड पॅलेट"],
  "cmd.placeholder": ["Type a command, search pages, or switch currency...", "कमांड लिखें, पेज खोजें या मुद्रा बदलें...", "कमांड लिहा, पेज शोधा किंवा चलन बदला..."],
  "cmd.group.navigation": ["Navigation & Views", "नेविगेशन और दृश्य", "नेव्हिगेशन आणि दृश्ये"],
  "cmd.group.actions": ["Quick Actions", "त्वरित कार्य", "जलद कृती"],
  "cmd.group.personas": ["Demo Personas", "डेमो प्रोफ़ाइल", "डेमो प्रोफाइल"],
  "cmd.group.currency": ["Global Currency & Formatting", "मुद्रा और प्रारूप", "चलन आणि स्वरूप"],
  "cmd.none": ["No matching commands or pages for", "कोई मेल खाती कमांड या पेज नहीं मिला:", "जुळणारी कमांड किंवा पेज सापडले नाही:"],
  "cmd.hint": ["Use ↑ ↓ to navigate, ↵ to select", "↑ ↓ से चुनें, ↵ से खोलें", "↑ ↓ ने निवडा, ↵ ने उघडा"],
  "cmd.hub": ["• Command Hub", "• कमांड केंद्र", "• कमांड केंद्र"],
  "cmd.clear": ["Clear search", "खोज साफ़ करें", "शोध साफ करा"],
  "cmd.badge.Action": ["Action", "कार्य", "कृती"],
  "cmd.badge.Fun": ["Fun", "मज़ेदार", "मजेदार"],
  "cmd.badge.Active": ["Active", "सक्रिय", "सक्रिय"],
  "cmd.badge.Selected": ["Selected", "चयनित", "निवडलेले"],
  "cmd.switchPersona": ["Switch Persona:", "प्रोफ़ाइल बदलें:", "प्रोफाइल बदला:"],
  "cmd.setCurrency": ["Set Currency:", "मुद्रा चुनें:", "चलन निवडा:"],
  "cmd.rate": ["Rate", "दर", "दर"],
  "cmd.nav.dashboard": ["Dashboard", "डैशबोर्ड", "डॅशबोर्ड"],
  "cmd.nav.dashboard.sub": ["Overview, telemetry & net worth", "सारांश, आंकड़े और कुल संपत्ति", "सारांश, आकडेवारी आणि निव्वळ संपत्ती"],
  "cmd.nav.transactions": ["Transactions Ledger & Review", "लेन-देन बही और समीक्षा", "व्यवहार खातेवही आणि पुनरावलोकन"],
  "cmd.nav.transactions.sub": ["Review inbox, categorize & tags", "समीक्षा इनबॉक्स, श्रेणी और टैग", "पुनरावलोकन इनबॉक्स, वर्ग आणि टॅग"],
  "cmd.nav.budgets": ["Budgets & Envelopes", "बजट और लिफ़ाफ़े", "बजेट आणि लिफाफे"],
  "cmd.nav.budgets.sub": ["Rollover surplus & overspend alerts", "बची राशि आगे ले जाएं और अधिक खर्च की चेतावनी", "उरलेली रक्कम पुढे नेणे आणि जास्त खर्चाचे इशारे"],
  "cmd.nav.goals": ["Financial Goals & Targets", "वित्तीय लक्ष्य", "आर्थिक ध्येये"],
  "cmd.nav.goals.sub": ["Milestones, artwork & required monthly pace", "पड़ाव, चित्र और ज़रूरी मासिक गति", "टप्पे, चित्रे आणि आवश्यक मासिक गती"],
  "cmd.nav.household": ["Household Co-Pilot Hub", "परिवार सह-पायलट केंद्र", "कुटुंब सह-पायलट केंद्र"],
  "cmd.nav.household.sub": ["Shared wealth split, partner invites & settlement", "साझा संपत्ति का बँटवारा, साथी को आमंत्रण और हिसाब", "सामायिक संपत्तीची विभागणी, जोडीदाराला निमंत्रण आणि हिशेब"],
  "cmd.nav.copilot": ["AI Wealth Advisor", "एआई धन सलाहकार", "एआय संपत्ती सल्लागार"],
  "cmd.nav.copilot.sub": ["Autonomous financial intelligence & advice", "स्वायत्त वित्तीय विश्लेषण और सलाह", "स्वायत्त आर्थिक विश्लेषण आणि सल्ला"],
  "cmd.nav.simulate": ["Opt-out Simulator", "सदस्यता रद्द सिमुलेटर", "सदस्यता रद्द सिम्युलेटर"],
  "cmd.nav.simulate.sub": ["What you save by cancelling subscriptions", "सदस्यताएं रद्द करने पर कितनी बचत", "सदस्यता रद्द केल्यास किती बचत"],
  "cmd.nav.forecast": ["Forecast & Risk", "पूर्वानुमान और जोखिम", "अंदाज आणि जोखीम"],
  "cmd.nav.forecast.sub": ["Monte-Carlo projections & income shocks", "मोंटे-कार्लो अनुमान और आय के झटके", "मॉन्टे-कार्लो अंदाज आणि उत्पन्नाचे धक्के"],
  "cmd.nav.plan": ["Financial Plan", "वित्तीय योजना", "आर्थिक योजना"],
  "cmd.nav.plan.sub": ["6-month constrained plan with probabilistic forecast", "संभाव्य पूर्वानुमान के साथ 6 महीने की योजना", "संभाव्य अंदाजासह 6 महिन्यांची योजना"],
  "cmd.nav.tax": ["Tax Analytics & Deductions", "कर विश्लेषण और कटौतियां", "कर विश्लेषण आणि वजावटी"],
  "cmd.nav.tax.sub": ["Regime analysis & 80C deductions", "कर प्रणाली विश्लेषण और 80C कटौती", "कर प्रणाली विश्लेषण आणि 80C वजावट"],
  "cmd.nav.statement": ["Executive Statement Export", "कार्यकारी विवरण निर्यात", "कार्यकारी विवरण निर्यात"],
  "cmd.nav.statement.sub": ["Printable PDF & financial summary", "प्रिंट योग्य पीडीएफ और वित्तीय सारांश", "प्रिंट करता येणारा पीडीएफ आणि आर्थिक सारांश"],
  "cmd.nav.security": ["Security & Audit Logs", "सुरक्षा और ऑडिट लॉग", "सुरक्षा आणि ऑडिट लॉग"],
  "cmd.nav.security.sub": ["Two-step sign-in & access policies", "दो-चरणीय साइन-इन और एक्सेस नीतियां", "द्वि-चरणीय साइन-इन आणि प्रवेश धोरणे"],
  "cmd.nav.finsec": ["Financial Security", "वित्तीय सुरक्षा", "आर्थिक सुरक्षा"],
  "cmd.nav.finsec.sub": ["Fraud, leakage & duplicate-charge findings", "धोखाधड़ी, रिसाव और दोहरे शुल्क के निष्कर्ष", "फसवणूक, गळती आणि दुहेरी शुल्काचे निष्कर्ष"],
  "cmd.nav.wallet": ["Wallet Guard", "वॉलेट गार्ड", "वॉलेट गार्ड"],
  "cmd.nav.wallet.sub": ["Check a Bitcoin wallet before you pay", "भुगतान से पहले बिटकॉइन वॉलेट जांचें", "पैसे देण्यापूर्वी बिटकॉइन वॉलेट तपासा"],
  "cmd.nav.credits": ["Credits", "क्रेडिट", "क्रेडिट"],
  "cmd.nav.credits.sub": ["Balance, top-up & usage for wallet checks", "वॉलेट जांच के लिए बैलेंस, टॉप-अप और उपयोग", "वॉलेट तपासणीसाठी शिल्लक, टॉप-अप आणि वापर"],
  "cmd.nav.evidence": ["Evidence Council", "साक्ष्य परिषद", "पुरावा परिषद"],
  "cmd.nav.evidence.sub": ["Evidence room for flagged payments", "चिह्नित भुगतानों का साक्ष्य कक्ष", "चिन्हांकित देयकांचा पुरावा कक्ष"],
  "cmd.nav.council": ["Risk Council", "जोखिम परिषद", "जोखीम परिषद"],
  "cmd.nav.council.sub": ["Agents debate a risky payment", "एजेंट जोखिम भरे भुगतान पर विचार करते हैं", "एजंट धोकादायक देयकावर चर्चा करतात"],
  "cmd.nav.twin": ["Twin Simulator", "ट्विन सिमुलेटर", "ट्विन सिम्युलेटर"],
  "cmd.nav.twin.sub": ["Simulate a fraud attempt on your twin", "अपने ट्विन पर धोखाधड़ी का प्रयास आज़माएं", "तुमच्या ट्विनवर फसवणुकीचा प्रयत्न तपासा"],
  "cmd.nav.connect": ["Connectors", "कनेक्टर", "कनेक्टर"],
  "cmd.nav.connect.sub": ["Link bank, UPI and statement sources", "बैंक, यूपीआई और स्टेटमेंट स्रोत जोड़ें", "बँक, यूपीआय आणि स्टेटमेंट स्रोत जोडा"],
  "cmd.nav.upload": ["Upload document", "दस्तावेज़ अपलोड करें", "दस्तऐवज अपलोड करा"],
  "cmd.nav.upload.sub": ["Scan a bill or statement", "बिल या स्टेटमेंट स्कैन करें", "बिल किंवा स्टेटमेंट स्कॅन करा"],
  "cmd.nav.mydata": ["My Data", "मेरा डेटा", "माझा डेटा"],
  "cmd.nav.mydata.sub": ["What is stored, export or delete", "क्या संग्रहीत है, निर्यात या हटाएं", "काय साठवले आहे, निर्यात किंवा हटवा"],
  "cmd.nav.profile": ["Profile", "प्रोफ़ाइल", "प्रोफाइल"],
  "cmd.nav.profile.sub": ["Your details and preferences", "आपका विवरण और प्राथमिकताएं", "तुमचा तपशील आणि प्राधान्ये"],
  "cmd.act.review": ["Open Review Queue", "समीक्षा कतार खोलें", "पुनरावलोकन रांग उघडा"],
  "cmd.act.review.sub": ["Process unreviewed transactions", "बिना समीक्षा वाले लेन-देन निपटाएं", "पुनरावलोकन न झालेले व्यवहार हाताळा"],
  "cmd.act.budget": ["Manage Budget Envelopes", "बजट लिफ़ाफ़े प्रबंधित करें", "बजेट लिफाफे व्यवस्थापित करा"],
  "cmd.act.budget.sub": ["Configure rollover & notifications", "रोलओवर और सूचनाएं सेट करें", "रोलओव्हर आणि सूचना सेट करा"],
  "cmd.act.invite": ["Invite Partner to Household", "साथी को परिवार में आमंत्रित करें", "जोडीदाराला कुटुंबात आमंत्रित करा"],
  "cmd.act.invite.sub": ["Generate secure token invite", "सुरक्षित टोकन आमंत्रण बनाएं", "सुरक्षित टोकन निमंत्रण तयार करा"],
  "cmd.act.confetti": ["Celebrate Milestone!", "उपलब्धि का जश्न मनाएं!", "यशाचा आनंद साजरा करा!"],
  "cmd.act.confetti.sub": ["Trigger celebratory particle burst", "जश्न का कॉन्फ़ेटी चलाएं", "आनंदाचे कॉन्फेटी उडवा"],

  // top bar / mobile
  "bar.search": ["Search or jump to…", "खोजें या कहीं जाएं…", "शोधा किंवा जा…"],
  "bar.privacy.hide": ["Hide amounts", "राशि छिपाएं", "रक्कम लपवा"],
  "bar.privacy.show": ["Show amounts", "राशि दिखाएं", "रक्कम दाखवा"],
};

export function tx(lang: Lang, key: string, fallback?: string): string {
  const row = L[key];
  if (row) {
    const i = LANGS.findIndex((l) => l.code === lang);
    return row[i] || row[0];
  }
  return translate(lang, key, fallback);
}

/** Like `useT` from lib/i18n, plus the component-level keys above. */
export function useT() {
  const lang = useLang();
  return { lang, t: (key: string, fallback?: string) => tx(lang, key, fallback) };
}

export const LOCAL_KEYS = Object.keys(L);
