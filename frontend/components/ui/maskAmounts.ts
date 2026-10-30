const CUR = "(?:[₹$€£]|S\\$|AED|INR|USD|EUR|GBP|SGD|Rs\\.?)";
/** One rendered amount: symbol/code then number (with an optional K/L/Cr/M suffix), or number then symbol/code. */
const AMOUNT_TOKEN = new RegExp(
  `${CUR}\\s?[-+\u2212]?\\s?[\\d][\\d,.]*(?:\\s?(?:Cr|Lakh|Lac|L|K|M|B))?|[\\d][\\d,.]*\\s?${CUR}(?![A-Za-z])`,
  "g",
);
export const MASK = "\u2022\u2022\u2022\u2022";
/** Replaces every amount in `text` with a mask. Pure, so it is unit-testable. */
export const maskAmounts = (text: string): string => text.replace(AMOUNT_TOKEN, MASK);

