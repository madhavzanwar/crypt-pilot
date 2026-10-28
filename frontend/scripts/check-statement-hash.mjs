// Verifies the in-browser SHA-256 against Node's crypto (standard vectors + random strings + unicode), run with:
//   cd frontend && node --experimental-strip-types scripts/check-statement-hash.mjs   (Node 22+)
import { createHash, randomBytes } from "node:crypto";
import { sha256Hex } from "../lib/crypto/sha256.ts";

const ref = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const vectors = ["", "abc", "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "a".repeat(1000000), "₹ ९८ 🚀 नमस्ते"];
for (let i = 0; i < 300; i++) vectors.push(randomBytes(i % 130).toString("latin1"));
for (const n of [55, 56, 57, 63, 64, 65, 119, 120, 121]) vectors.push("x".repeat(n)); // padding boundaries
let bad = 0;
for (const v of vectors) if (sha256Hex(v) !== ref(v)) { bad++; console.log("MISMATCH for length", v.length); }
console.log(`${vectors.length} inputs, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
