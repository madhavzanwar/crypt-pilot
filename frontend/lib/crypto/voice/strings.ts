"use client";

import { LANGS, useT, type Lang as AppLang } from "@/lib/i18n";

/**
 * UI text for the voice + wallet parts of the Copilot. Rows are [en, hi, mr]. They are passed as the
 * `fallback` of FinPilot's `t(key, fallback)`, so a translation added later in lib/i18n.ts wins.
 */
const S = {
  "cp.mic.start": ["Speak your question", "बोलकर पूछें", "बोलून विचारा"],
  "cp.mic.stop": ["Stop and transcribe", "रोकें और लिखें", "थांबवा आणि लिहा"],
  "cp.mic.cancel": ["Cancel recording", "रिकॉर्डिंग रद्द करें", "रेकॉर्डिंग रद्द करा"],
  "cp.mic.requesting": ["Waiting for microphone permission", "माइक्रोफ़ोन की अनुमति का इंतज़ार", "मायक्रोफोन परवानगीची प्रतीक्षा"],
  "cp.mic.recording": ["Listening. Tap to stop.", "सुन रहा है। रोकने के लिए टैप करें।", "ऐकत आहे. थांबवण्यासाठी टॅप करा."],
  "cp.mic.transcribing": ["Transcribing", "लिख रहा है", "लिहीत आहे"],
  "cp.mic.unsupported": ["Voice input is not supported in this browser.", "इस ब्राउज़र में आवाज़ से इनपुट नहीं चलता।", "या ब्राउझरमध्ये आवाजाने इनपुट चालत नाही."],
  "cp.mic.err.denied": [
    "Microphone is blocked. Allow it from the lock icon in the address bar, then try again.",
    "माइक्रोफ़ोन बंद है। एड्रेस बार के लॉक आइकन से अनुमति दें और फिर कोशिश करें।",
    "मायक्रोफोन बंद आहे. अॅड्रेस बारमधील लॉक आयकॉनवरून परवानगी द्या आणि पुन्हा प्रयत्न करा.",
  ],
  "cp.mic.err.noMic": ["No microphone found. Plug one in and try again.", "कोई माइक्रोफ़ोन नहीं मिला। एक लगाएँ और फिर कोशिश करें।", "मायक्रोफोन सापडला नाही. एक जोडा आणि पुन्हा प्रयत्न करा."],
  "cp.mic.err.empty": ["I did not hear anything. Tap the mic and try again.", "कुछ सुनाई नहीं दिया। माइक दबाकर फिर कोशिश करें।", "काही ऐकू आले नाही. माइक दाबून पुन्हा प्रयत्न करा."],
  "cp.mic.err.failed": ["Could not transcribe that. Please try again.", "यह लिख नहीं पाए। कृपया फिर कोशिश करें।", "हे लिहिता आले नाही. कृपया पुन्हा प्रयत्न करा."],
  "cp.mic.err.unavailable": [
    "The voice service is not available. Tap the mic again to use your browser's speech recognition.",
    "आवाज़ सेवा अभी उपलब्ध नहीं है। अपने ब्राउज़र की आवाज़ पहचान के लिए माइक फिर दबाएँ।",
    "आवाज सेवा सध्या उपलब्ध नाही. तुमच्या ब्राउझरच्या आवाज ओळखीसाठी माइक पुन्हा दाबा.",
  ],
  "cp.mic.err.unavailableNoBrowser": [
    "The voice service is not available and this browser has no speech recognition. Please type instead.",
    "आवाज़ सेवा उपलब्ध नहीं है और इस ब्राउज़र में आवाज़ पहचान नहीं है। कृपया टाइप करें।",
    "आवाज सेवा उपलब्ध नाही आणि या ब्राउझरमध्ये आवाज ओळख नाही. कृपया टाइप करा.",
  ],
  "cp.voice.label": ["Voice", "आवाज़", "आवाज"],
  "cp.voice.wispr": ["Wispr Flow", "Wispr Flow", "Wispr Flow"],
  "cp.voice.sarvam": ["Sarvam", "Sarvam", "Sarvam"],
  "cp.voice.browser": ["Browser speech", "ब्राउज़र आवाज़", "ब्राउझर आवाज"],
  "cp.voice.review": [
    "Check the words, especially any wallet address, then press send.",
    "शब्द जाँच लें, ख़ासकर वॉलेट का पता, फिर भेजें।",
    "शब्द तपासा, विशेषतः वॉलेट पत्ता, मग पाठवा.",
  ],
  "cp.secret.title": ["That looks like a seed phrase or private key.", "यह सीड फ़्रेज़ या प्राइवेट की जैसा लगता है।", "हे सीड फ्रेज किंवा प्रायव्हेट की सारखे दिसते."],
  "cp.secret.body": [
    "I cleared it and did not send it anywhere. Never share it with anyone. A wallet check only needs the public address.",
    "मैंने इसे हटा दिया और कहीं नहीं भेजा। इसे किसी को न बताएँ। वॉलेट जाँच के लिए सिर्फ़ पब्लिक पता चाहिए।",
    "मी ते काढून टाकले आणि कुठेही पाठवले नाही. ते कोणालाही सांगू नका. वॉलेट तपासणीसाठी फक्त सार्वजनिक पत्ता लागतो.",
  ],
  "cp.secret.dismiss": ["Dismiss", "बंद करें", "बंद करा"],
  "cp.wallet.title": ["Wallet check", "वॉलेट जाँच", "वॉलेट तपासणी"],
  "cp.wallet.sub": ["From the Cryptiq risk service, not FinPilot's money data", "Cryptiq जोखिम सेवा से, FinPilot के पैसों के डेटा से नहीं", "Cryptiq जोखीम सेवेकडून, FinPilot च्या पैशांच्या डेटावरून नाही"],
  "cp.wallet.run": ["Check this wallet", "इस वॉलेट को जाँचें", "हे वॉलेट तपासा"],
  "cp.wallet.runNote": [
    "Earlier chats do not re-run checks on their own, so no credit is used until you ask.",
    "पुरानी चैट अपने आप जाँच दोबारा नहीं चलातीं, इसलिए आप कहें तब तक क्रेडिट नहीं लगता।",
    "जुन्या चॅट आपोआप तपासणी पुन्हा करत नाहीत, त्यामुळे तुम्ही सांगेपर्यंत क्रेडिट लागत नाही.",
  ],
  "cp.wallet.typo": [
    "That looks like a Bitcoin address, but its checksum does not match, so it is probably mistyped or misheard. I did not check it. Please correct it and send again.",
    "यह बिटकॉइन पता जैसा है, पर इसका चेकसम मेल नहीं खाता, यानी शायद गलत लिखा या सुना गया। मैंने इसे नहीं जाँचा। कृपया सही करके फिर भेजें।",
    "हा बिटकॉइन पत्त्यासारखा दिसतो, पण चेकसम जुळत नाही, म्हणजे बहुधा चुकीचे लिहिले किंवा ऐकले गेले. मी तो तपासला नाही. कृपया दुरुस्त करून पुन्हा पाठवा.",
  ],
  "cp.chip.check": ["Check a wallet before I pay", "पैसे देने से पहले वॉलेट जाँचें", "पैसे देण्यापूर्वी वॉलेट तपासा"],
  "cp.chip.checkPrefill": ["Is this wallet safe to pay? ", "क्या इस वॉलेट में पैसे भेजना सुरक्षित है? ", "या वॉलेटमध्ये पैसे पाठवणे सुरक्षित आहे का? "],
  "cp.chip.evidence": ["Explain the graph evidence", "TigerGraph के सबूत समझाएँ", "TigerGraph चे पुरावे समजवा"],
  "cp.chip.evidencePrefill": ["Explain the graph evidence for this wallet: ", "इस वॉलेट के लिए TigerGraph के सबूत समझाएँ: ", "या वॉलेटसाठी TigerGraph चे पुरावे समजवा: "],
  "cp.evidence.title": ["What the graph evidence says", "ग्राफ़ के सबूत क्या कहते हैं", "ग्राफचे पुरावे काय सांगतात"],
  "cp.status.online": ["Wallet checks online", "वॉलेट जाँच चालू", "वॉलेट तपासणी चालू"],
  "cp.status.voice": ["Voice service", "आवाज़ सेवा", "आवाज सेवा"],
  "cp.status.mocks": ["demo data", "डेमो डेटा", "डेमो डेटा"],
  "cp.input.placeholder": [
    "Ask about spending, debts, deadlines, schemes or a wallet address...",
    "ख़र्च, कर्ज़, समय-सीमा, योजनाओं या वॉलेट पते के बारे में पूछें...",
    "खर्च, कर्ज, मुदत, योजना किंवा वॉलेट पत्त्याबद्दल विचारा...",
  ],
} as const satisfies Record<string, readonly [string, string, string]>;

export type VoiceStringKey = keyof typeof S;

/** The default text for `key` in `lang` (English when a translation is missing). */
export function voiceString(lang: AppLang, key: VoiceStringKey): string {
  const row = S[key];
  return row[LANGS.findIndex((l) => l.code === lang)] || row[0];
}

/** `tr(key)` = FinPilot's `t(key, default)` with the defaults from the table above. */
export function useVoiceT() {
  const { lang, t } = useT();
  return { lang, tr: (key: VoiceStringKey) => t(key, voiceString(lang, key)) };
}
