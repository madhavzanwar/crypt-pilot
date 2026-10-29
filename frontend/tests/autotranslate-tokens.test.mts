const src = (await import("node:fs")).readFileSync(process.cwd() + "/components/AutoTranslate.tsx","utf8");
const re = src.match(/export const PROTECTED_TOKEN =\n  (\/.*\/g);/)![1];
const P = eval(re) as RegExp;
const DEV=(v:string)=>v.replace(/[0-9]/g,d=>String.fromCharCode(0x966+ +d));
const toDev=(v:string)=>{let o="",l=0;for(const m of v.matchAll(P)){o+=DEV(v.slice(l,m.index))+m[0];l=m.index!+m[0].length}return o+DEV(v.slice(l))};
for (const t of ["0x2e58a1b2c3d4","1Q8f6cAbCdEfGhJk","AADPS9102K","3cd99dff-8c5a-4fe5-b3c7-c1bb437c9181","bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq","Paid ₹1,250 on 12 Oct","0x2e58…a1b2","Score 85 of 100"]) console.log(t," => ",toDev(t));
// BUG-003 regression: identifiers must be untouched, ordinary numbers still converted. Run: npx tsx tests/autotranslate-tokens.test.mts
const same = ["0x2e58a1b2c3d4", "AADPS9102K", "3cd99dff-8c5a-4fe5-b3c7-c1bb437c9181", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "0x2e58…a1b2", "1Q8f6cAbCdEfGhJk"];
for (const t of same) if (toDev(t) !== t) { console.error("FAIL altered", t); process.exit(1); }
if (toDev("Score 85") !== "Score ८५") { console.error("FAIL digits"); process.exit(1); }
console.log("PASS");
