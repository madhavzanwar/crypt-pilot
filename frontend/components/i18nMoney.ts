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
  "hs.sub": ["Who owes who in your household", "आपके घर में किसे किसको देना है", "तुमच्या घरात कोणी कोणाला द्यायचे"],
  "hs.sample": ["Sample data", "नमूना डेटा", "नमुना डेटा"],
  "hs.sample_d": ["This is shared sample data. Create your own household or sign in to track real expenses.", "यह साझा नमूना डेटा है। असली खर्च ट्रैक करने के लिए अपना घर बनाएँ या साइन इन करें।", "हा सामायिक नमुना डेटा आहे. खरे खर्च ट्रॅक करण्यासाठी स्वतःचे घर तयार करा किंवा साइन इन करा."],
  "hs.no_hh": ["No household yet", "अभी कोई घर नहीं", "अजून घर नाही"],
  "hs.no_hh_d": ["Create a household to split bills and see who owes who.", "बिल बाँटने और देखने के लिए कि किसे किसको देना है, एक घर बनाएँ।", "बिले वाटण्यासाठी आणि कोणी कोणाला द्यायचे ते पाहण्यासाठी घर तयार करा."],
  "hs.no_hh_cta": ["Create a household", "घर बनाएँ", "घर तयार करा"],
  "hs.loading": ["Loading shared expenses…", "साझा खर्च लोड हो रहे हैं…", "सामायिक खर्च लोड होत आहेत…"],
  "hs.retry": ["Try again", "फिर कोशिश करें", "पुन्हा प्रयत्न करा"],
  "hs.settled": ["All settled", "सब बराबर है", "सर्व हिशोब पूर्ण"],
  "hs.settled_d": ["Nobody owes anyone right now.", "अभी किसी को किसी को कुछ नहीं देना।", "सध्या कोणीही कोणाचे देणे लागत नाही."],
  "hs.owes": ["owes", "को देना है", "ला द्यायचे आहेत"],
  "hs.settle": ["Settle up", "हिसाब चुकाएँ", "हिशोब चुकता करा"],
  "hs.paid": ["Paid", "चुकाया", "भरले"],
  "hs.owed": ["Share", "हिस्सा", "वाटा"],
  "hs.net": ["Net", "शुद्ध", "निव्वळ"],
  "hs.gets_back": ["gets back", "को मिलना है", "ला परत मिळतील"],
  "hs.add": ["Add shared expense", "साझा खर्च जोड़ें", "सामायिक खर्च जोडा"],
  "hs.f_title": ["What was it for?", "यह किसलिए था?", "हे कशासाठी होते?"],
  "hs.f_amount": ["Amount", "राशि", "रक्कम"],
  "hs.f_paid_by": ["Paid by", "किसने चुकाया", "कोणी भरले"],
  "hs.f_split": ["Split between", "इनके बीच बाँटें", "यांच्यात वाटा"],
  "hs.f_date": ["Date", "तारीख", "तारीख"],
  "hs.f_category": ["Category (optional)", "श्रेणी (वैकल्पिक)", "वर्ग (ऐच्छिक)"],
  "hs.f_save": ["Add expense", "खर्च जोड़ें", "खर्च जोडा"],
  "hs.f_saving": ["Saving…", "सहेज रहे हैं…", "जतन करत आहे…"],
  "hs.expenses": ["Expenses", "खर्च", "खर्च"],
  "hs.no_expenses": ["No shared expenses yet. Add the first one above.", "अभी कोई साझा खर्च नहीं। ऊपर पहला जोड़ें।", "अजून सामायिक खर्च नाहीत. वर पहिला जोडा."],
  "hs.paid_by_x": ["paid by", "चुकाने वाला", "भरणारा"],
  "hs.split_x": ["split", "बाँटा", "वाटले"],
  "hs.way": ["ways", "हिस्सों में", "वाटे"],
  "hs.delete": ["Delete", "हटाएँ", "हटवा"],
  "hs.delete_q": ["Delete this expense? Balances will be recalculated.", "यह खर्च हटाएँ? बैलेंस दोबारा गिने जाएँगे।", "हा खर्च हटवायचा? शिल्लक पुन्हा मोजली जाईल."],
  "hs.history": ["Settlements", "निपटान", "निपटारे"],
  "hs.no_history": ["No settlements recorded yet.", "अभी कोई निपटान दर्ज नहीं।", "अजून कोणताही निपटारा नोंदवलेला नाही."],
  "hs.paid_to": ["paid", "ने चुकाया", "ने दिले"],
  "hs.toast_added": ["Expense added", "खर्च जोड़ा गया", "खर्च जोडला"],
  "hs.toast_deleted": ["Expense deleted", "खर्च हटाया गया", "खर्च हटवला"],
  "hs.toast_settled": ["Settlement recorded", "निपटान दर्ज हुआ", "निपटारा नोंदवला"],
  "hs.all": ["Everyone", "सभी", "सर्वजण"],
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
