/**
 * Plan page strings, [en, hi, mr]. Merged into the money dictionary (components/i18nMoney.ts).
 * {name} placeholders are filled by fill() in lib/planSummary.ts.
 */
export const PLAN_STRINGS: Record<string, [string, string, string]> = {
  // Item 1: plain-language summary
  "pl.sum.title": ["Your plan in plain words", "आपकी योजना सरल शब्दों में", "तुमची योजना सोप्या शब्दांत"],
  "pl.seq.status_quo": ["Status quo", "यथास्थिति", "सध्यासारखेच"],
  "pl.seq.debt_first": ["Debt first", "पहले कर्ज़", "आधी कर्ज"],
  "pl.seq.save_first": ["Save first", "पहले बचत", "आधी बचत"],
  "pl.seq.reserve_then_debt": ["Reserve, then debt", "पहले रिज़र्व, फिर कर्ज़", "आधी राखीव निधी, मग कर्ज"],
  "pl.seq.risk_adjusted": ["{label} (risk-adjusted)", "{label} (जोखिम के अनुसार समायोजित)", "{label} (जोखमीनुसार समायोजित)"],
  "pl.act.cut_1": ["In {from}: cut discretionary spending by about {amount}.", "{from} में: मर्ज़ी के खर्च में लगभग {amount} की कटौती करें।", "{from} मध्ये: ऐच्छिक खर्चात सुमारे {amount} ची कपात करा."],
  "pl.act.cut_n": ["From {from} to {to}: cut discretionary spending by about {amount} a month.", "{from} से {to} तक: हर महीने मर्ज़ी के खर्च में लगभग {amount} की कटौती करें।", "{from} ते {to}: दर महिन्याला ऐच्छिक खर्चात सुमारे {amount} ची कपात करा."],
  "pl.act.debt_1": ["In {from}: pay about {amount} extra towards your debt.", "{from} में: अपने कर्ज़ पर लगभग {amount} अतिरिक्त चुकाएँ।", "{from} मध्ये: तुमच्या कर्जावर सुमारे {amount} अतिरिक्त भरा."],
  "pl.act.debt_n": ["From {from} to {to}: pay about {amount} extra towards your debt each month.", "{from} से {to} तक: हर महीने कर्ज़ पर लगभग {amount} अतिरिक्त चुकाएँ।", "{from} ते {to}: दर महिन्याला कर्जावर सुमारे {amount} अतिरिक्त भरा."],
  "pl.act.save_1": ["In {from}: move about {amount} into savings.", "{from} में: लगभग {amount} बचत में डालें।", "{from} मध्ये: सुमारे {amount} बचतीत टाका."],
  "pl.act.save_n": ["From {from} to {to}: move about {amount} into savings each month.", "{from} से {to} तक: हर महीने लगभग {amount} बचत में डालें।", "{from} ते {to}: दर महिन्याला सुमारे {amount} बचतीत टाका."],
  "pl.sum.rec": ["Recommended plan: {label}. Your first steps, in order:", "सुझाई गई योजना: {label}। आपके पहले कदम, क्रम से:", "सुचवलेली योजना: {label}. तुमची पहिली पावले, क्रमाने:"],
  "pl.sum.rec_none": [
    "Recommended plan: {label}. It needs no changes to your spending, so keep things as they are.",
    "सुझाई गई योजना: {label}। इसमें आपके खर्च में कोई बदलाव ज़रूरी नहीं है, इसलिए जैसा चल रहा है वैसा ही रखें।",
    "सुचवलेली योजना: {label}. यात तुमच्या खर्चात कोणताही बदल आवश्यक नाही, त्यामुळे जसे चालले आहे तसेच ठेवा.",
  ],
  "pl.sum.more_1": ["Plus 1 more step in the full plan below.", "नीचे पूरी योजना में 1 और कदम है।", "खाली संपूर्ण योजनेत आणखी 1 पाऊल आहे."],
  "pl.sum.more_n": ["Plus {n} more steps in the full plan below.", "नीचे पूरी योजना में {n} और कदम हैं।", "खाली संपूर्ण योजनेत आणखी {n} पावले आहेत."],
  "pl.sum.outlook": [
    "By the end of {month} you are most likely to have about {p50}, with a likely range of {p10} to {p90}.",
    "{month} के अंत तक आपके पास सबसे संभावित रूप से लगभग {p50} होंगे, और संभावित दायरा {p10} से {p90} है।",
    "{month} अखेरीस तुमच्याकडे बहुधा सुमारे {p50} असतील, आणि संभाव्य श्रेणी {p10} ते {p90} आहे.",
  ],
  "pl.sum.reserve_holds": [
    "Your safety reserve of {reserve} holds: in the worst realistic case (the bottom of the band) your balance stays above it in all {n} months.",
    "आपका {reserve} का सुरक्षा रिज़र्व बना रहता है: सबसे बुरे यथार्थवादी हाल में भी (बैंड का निचला किनारा) आपका बैलेंस सभी {n} महीनों में उससे ऊपर रहता है।",
    "तुमची {reserve} ची सुरक्षा राखीव निधी टिकते: सर्वात वाईट वास्तववादी परिस्थितीतही (पट्ट्याची खालची कड) तुमची शिल्लक सर्व {n} महिन्यांत त्याच्या वर राहते.",
  ],
  "pl.sum.reserve_p10_dips": [
    "Your safety reserve of {reserve} holds on the most likely path, but in the worst realistic case (the bottom of the band) your balance dips below it in month {k} ({month}).",
    "सबसे संभावित राह पर आपका {reserve} का सुरक्षा रिज़र्व बना रहता है, लेकिन सबसे बुरे यथार्थवादी हाल में (बैंड का निचला किनारा) आपका बैलेंस महीने {k} ({month}) में उससे नीचे चला जाता है।",
    "सर्वाधिक संभाव्य मार्गावर तुमची {reserve} ची सुरक्षा राखीव निधी टिकते, पण सर्वात वाईट वास्तववादी परिस्थितीत (पट्ट्याची खालची कड) तुमची शिल्लक महिना {k} ({month}) मध्ये त्याच्या खाली जाते.",
  ],
  "pl.sum.reserve_p50_dips": [
    "Heads up: even on the most likely path your balance falls below your safety reserve of {reserve} in month {k} ({month}).",
    "ध्यान दें: सबसे संभावित राह पर भी आपका बैलेंस महीने {k} ({month}) में {reserve} के सुरक्षा रिज़र्व से नीचे चला जाता है।",
    "लक्ष द्या: सर्वाधिक संभाव्य मार्गावरही तुमची शिल्लक महिना {k} ({month}) मध्ये {reserve} च्या सुरक्षा राखीव निधीच्या खाली जाते.",
  ],
  "pl.sum.goal_on_track": [
    "Your goal of {amount} by {month} is on track on the most likely path.",
    "{month} तक {amount} का आपका लक्ष्य सबसे संभावित राह पर समय पर है।",
    "{month} पर्यंत {amount} चे तुमचे ध्येय सर्वाधिक संभाव्य मार्गावर वेळेत आहे.",
  ],
  "pl.sum.goal_short": [
    "Your goal of {amount} by {month} is not fully reached on the most likely path; this plan gets you about {pct} of the way there.",
    "{month} तक {amount} का आपका लक्ष्य सबसे संभावित राह पर पूरा नहीं होता; यह योजना आपको लगभग {pct} तक पहुँचाती है।",
    "{month} पर्यंत {amount} चे तुमचे ध्येय सर्वाधिक संभाव्य मार्गावर पूर्ण होत नाही; ही योजना तुम्हाला सुमारे {pct} पर्यंत पोहोचवते.",
  ],
  "pl.sum.goal_conflict": [
    "Your goal of {amount} by {month} cannot be met together with your safety reserve as they are set. See the section below for verified ways to adjust.",
    "{month} तक {amount} का लक्ष्य और आपका सुरक्षा रिज़र्व, जैसे अभी तय हैं, साथ में पूरे नहीं हो सकते। बदलने के जाँचे हुए तरीके नीचे के भाग में देखें।",
    "{month} पर्यंत {amount} चे ध्येय आणि तुमची सुरक्षा राखीव निधी, सध्या ठरवल्याप्रमाणे, एकत्र साध्य होऊ शकत नाहीत. बदल करण्याचे तपासलेले मार्ग खालील भागात पाहा.",
  ],
  "pl.copy": ["Copy summary", "सारांश कॉपी करें", "सारांश कॉपी करा"],
  "pl.copied": ["Copied", "कॉपी हो गया", "कॉपी झाले"],
  // Item 2: reading the cash chart
  "pl.cap.line": ["Most likely path (median, P50)", "सबसे संभावित राह (माध्यिका, P50)", "सर्वाधिक संभाव्य मार्ग (मध्यक, P50)"],
  "pl.cap.band": ["Middle 80% of simulated outcomes (P10 to P90)", "सिमुलेशन के बीच के 80% नतीजे (P10 से P90)", "सिम्युलेशनमधील मधले 80% निकाल (P10 ते P90)"],
  "pl.cap.reserve": ["Your safety reserve", "आपका सुरक्षा रिज़र्व", "तुमची सुरक्षा राखीव निधी"],
  "pl.cap.text": [
    "The solid line is the most likely path (the median, P50). The shaded band is the middle 80% of simulated outcomes (P10 to P90): in any given month about 8 out of 10 simulations fall inside it, and about 9 out of 10 simulations are above its bottom edge. The dashed line is your safety reserve.",
    "ठोस रेखा सबसे संभावित राह (माध्यिका, P50) है। छायांकित पट्टी सिमुलेशन के बीच के 80% नतीजे (P10 से P90) दिखाती है: किसी भी महीने में लगभग 10 में से 8 सिमुलेशन इसके अंदर आते हैं, और लगभग 10 में से 9 सिमुलेशन इसके निचले किनारे से ऊपर रहते हैं। टूटी हुई रेखा आपका सुरक्षा रिज़र्व है।",
    "घन रेषा सर्वाधिक संभाव्य मार्ग (मध्यक, P50) आहे. छायांकित पट्टा सिम्युलेशनमधील मधले 80% निकाल (P10 ते P90) दाखवतो: कोणत्याही महिन्यात सुमारे 10 पैकी 8 सिम्युलेशन त्याच्या आत येतात, आणि सुमारे 10 पैकी 9 सिम्युलेशन त्याच्या खालच्या कडेच्या वर राहतात. तुटक रेषा तुमची सुरक्षा राखीव निधी आहे.",
  ],
  "pl.cap.reserve_short": ["Reserve", "रिज़र्व", "राखीव"],
  "pl.cap.key": ["Chart key", "चार्ट की व्याख्या", "चार्टची माहिती"],
  "pl.cap.risk": [
    "In {pct} of the {n} simulations for {label}, cash dips below the reserve in at least one month.",
    "{label} के {n} सिमुलेशन में से {pct} में कम से कम एक महीने नकदी रिज़र्व से नीचे चली जाती है।",
    "{label} च्या {n} सिम्युलेशनपैकी {pct} मध्ये किमान एका महिन्यात रोख राखीव निधीच्या खाली जाते.",
  ],
  "pl.cap.risk_zero": [
    "In none of the {n} simulations for {label} does cash dip below the reserve.",
    "{label} के {n} सिमुलेशन में से किसी में भी नकदी रिज़र्व से नीचे नहीं जाती।",
    "{label} च्या {n} सिम्युलेशनपैकी एकातही रोख राखीव निधीच्या खाली जात नाही.",
  ],
};
