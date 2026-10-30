// QA2-13 / QA4-3: every component-level key has Hindi and Marathi text, and every t("key") used in the shell resolves.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tx, LOCAL_KEYS } from "../components/i18nLocal.ts";

test("hi and mr exist and differ from English for translatable keys", () => {
  const same = new Set(["nav.Skip"]);
  for (const k of LOCAL_KEYS) {
    const en = tx("en", k);
    for (const lang of ["hi", "mr"]) {
      const v = tx(lang, k);
      assert.ok(v && /[ऀ-ॿ]/.test(v), `${k} (${lang}) has Devanagari text`);
      if (!same.has(k)) assert.notEqual(v, en, `${k} (${lang}) is translated`);
    }
  }
});

test("keys used by the shell exist", () => {
  const files = ["components/ui/CommandPalette.tsx", "components/NavShell.tsx", "components/AppSidebar.tsx", "components/statement/StatementVerify.tsx", "components/statement/StatementAnchorPanel.tsx"];
  const keys = new Set(LOCAL_KEYS);
  for (const f of files) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/\bt\("((?:cmd|bar|stmt|web3\.chip)[^"]*)"/g)) assert.ok(keys.has(m[1]), `${f}: missing ${m[1]}`);
  }
});

test("sidebar labels all have translations", () => {
  const src = readFileSync(new URL("../components/AppSidebar.tsx", import.meta.url), "utf8");
  const labels = [...src.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]).filter((l) => !/^(Copilot|Crypto|Track|Intelligence|Reports|Security)$/.test(l) || true);
  for (const l of labels) assert.notEqual(tx("hi", `nav.${l}`), l, `hi: nav.${l}`);
});
