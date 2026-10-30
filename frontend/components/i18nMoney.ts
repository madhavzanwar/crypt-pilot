"use client";

import { LANGS, translate, useLang, type Lang } from "@/lib/i18n";

/**
 * Money-page labels (connect, household). [en, hi, mr]. Every row has real Hindi and Marathi text;
 * keys not listed here fall through to the shared dictionary in lib/i18n.ts.
 */
const M: Record<string, [string, string, string]> = {
  "mc.connected": ["Connected", "जुड़ा हुआ", "जोडलेले"],
  "mc.connected_nodata": ["Connected, no data yet", "जुड़ा है, अभी कोई डेटा नहीं", "जोडले आहे, अजून डेटा नाही"],
  "mc.nodata_msg": [
    "Linked, but no transactions have arrived yet. Nothing shows on your dashboard until data comes in.",
    "जुड़ गया, पर अभी कोई लेन-देन नहीं आया। डेटा आने तक डैशबोर्ड पर कुछ नहीं दिखेगा।",
    "जोडले, पण अजून व्यवहार आलेले नाहीत. डेटा येईपर्यंत डॅशबोर्डवर काही दिसणार नाही.",
  ],
  "mc.ready": ["Ready", "तैयार", "तयार"],
  "mc.soon": ["Coming soon", "जल्द आ रहा है", "लवकरच येत आहे"],
  "mc.connect": ["Connect", "जोड़ें", "जोडा"],
  "mc.export": ["Export", "निर्यात करें", "निर्यात करा"],
  "mc.disconnect": ["Disconnect", "हटाएँ", "तोडा"],
  "mc.rail": ["Payment rail", "भुगतान माध्यम", "पेमेंट माध्यम"],
  "mc.available": ["Available", "उपलब्ध", "उपलब्ध"],
  "mc.open_credits": ["Open credits", "क्रेडिट खोलें", "क्रेडिट उघडा"],
  "mc.add_card": ["Add a card", "कार्ड जोड़ें", "कार्ड जोडा"],
  "mc.add_card_sub": ["Credit or debit, demo only", "क्रेडिट या डेबिट, केवल डेमो", "क्रेडिट किंवा डेबिट, फक्त डेमो"],
  "mc.bank": ["Bank accounts", "बैंक खाते", "बँक खाती"],
  "mc.bank_d": ["Balances, salary credits, loans and cards", "बैलेंस, वेतन, लोन और कार्ड", "शिल्लक, पगार, कर्ज आणि कार्ड"],
  "mc.sheets": ["Google Sheets", "गूगल शीट्स", "गूगल शीट्स"],
  "mc.sheets_d": ["A live expense sheet: edit it and the app updates", "एक लाइव खर्च शीट: बदलें और ऐप अपडेट हो जाएगा", "लाइव्ह खर्च शीट: बदला आणि अ‍ॅप अपडेट होईल"],
  "mc.invoices": ["Gmail & Drive invoices", "जीमेल और ड्राइव के बिल", "जीमेल आणि ड्राइव्ह बिले"],
  "mc.invoices_d": ["Bills and invoices parsed automatically", "बिल और इनवॉइस अपने-आप पढ़े जाते हैं", "बिले आणि इनव्हॉइस आपोआप वाचली जातात"],
  "mc.invest": ["Mutual funds & stocks", "म्यूचुअल फंड और शेयर", "म्युच्युअल फंड आणि शेअर्स"],
  "mc.invest_d": ["SIPs and holdings from your depository", "आपके डिपॉजिटरी से SIP और होल्डिंग", "तुमच्या डिपॉझिटरीतील SIP आणि होल्डिंग"],
  "hs.title": ["Shared expenses", "साझा खर्च", "सामायिक खर्च"],
  "hs.empty": ["Shared expenses are not tracked yet", "साझा खर्च अभी ट्रैक नहीं होते", "सामायिक खर्च अजून ट्रॅक होत नाहीत"],
  "hs.empty_d": [
    "Who owes whom will appear here once shared expenses can be saved. Until then, nothing is calculated or invented for you.",
    "साझा खर्च सहेजे जा सकने पर यहाँ दिखेगा कि किसे किसको कितना देना है। तब तक कुछ भी गणना या अनुमान नहीं दिखाया जाता।",
    "सामायिक खर्च जतन करता येऊ लागल्यावर कोणी कोणाला किती द्यायचे ते येथे दिसेल. तोपर्यंत काहीही मोजले किंवा बनवले जात नाही.",
  ],
};

export const MONEY_KEYS = Object.keys(M);

export function tm(lang: Lang, key: string, fallback?: string): string {
  const row = M[key];
  if (!row) return translate(lang, key, fallback);
  return row[LANGS.findIndex((l) => l.code === lang)] || row[0];
}

/** Drop-in for useT(): money keys first, then the shared dictionary. */
export function useT() {
  const lang = useLang();
  return { lang, t: (key: string, fallback?: string) => tm(lang, key, fallback) };
}
