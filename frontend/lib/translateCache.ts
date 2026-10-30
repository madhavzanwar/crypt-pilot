/** Client cache in front of /api/translate: a string is sent at most once per language (kept in localStorage, shared by
 *  every page), identical in-flight requests are merged, texts are batched, and after a failure (rate limit, offline) no
 *  further requests are made for a cool-down so ordinary browsing cannot exhaust the server's rate limit. */

export type TranslateFetcher = (lang: string, texts: string[]) => Promise<Record<string, string>>;

const KEY = (lang: string) => `finpilot_tr_${lang}`; // same key AutoTranslate has always used
const BATCH = 60;
const MAX_ENTRIES = 5000;
export const COOLDOWN_MS = 5 * 60_000;

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export class TranslateCache {
  private mem = new Map<string, Record<string, string>>();
  private inflight = new Map<string, Promise<void>>(); // `${lang}\n${text}` -> request carrying it
  private coolUntil = 0;
  calls = 0;

  private fetcher: TranslateFetcher;
  private store: () => Store | null;
  private now: () => number;

  constructor(fetcher: TranslateFetcher, store: () => Store | null, now: () => number = Date.now) {
    this.fetcher = fetcher;
    this.store = store;
    this.now = now;
  }

  private load(lang: string): Record<string, string> {
    const known = this.mem.get(lang);
    if (known) return known;
    let m: Record<string, string> = {};
    try {
      m = (JSON.parse(this.store()?.getItem(KEY(lang)) ?? "{}") as Record<string, string> | null) ?? {};
    } catch {
      m = {};
    }
    this.mem.set(lang, m);
    return m;
  }

  private save(lang: string, m: Record<string, string>) {
    try {
      const keys = Object.keys(m);
      if (keys.length > MAX_ENTRIES) for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete m[k];
      this.store()?.setItem(KEY(lang), JSON.stringify(m));
    } catch {
      // storage full or blocked: the in-memory copy still works
    }
  }

  /** Translations for as many of `texts` as are known or obtainable; unknown ones are simply absent (the page stays English). */
  async translate(lang: string, texts: string[]): Promise<Record<string, string>> {
    const cache = this.load(lang);
    const want = [...new Set(texts)];
    const missing = want.filter((t) => !(t in cache));
    if (missing.length && this.now() >= this.coolUntil) {
      const waiting: Promise<void>[] = [];
      const fresh: string[] = [];
      for (const t of missing) {
        const p = this.inflight.get(`${lang}\n${t}`);
        if (p) waiting.push(p);
        else fresh.push(t);
      }
      for (let i = 0; i < fresh.length; i += BATCH) {
        const chunk = fresh.slice(i, i + BATCH);
        this.calls++;
        const p = this.fetcher(lang, chunk).then(
          (tr) => {
            Object.assign(cache, tr);
            this.save(lang, cache);
          },
          () => {
            this.coolUntil = this.now() + COOLDOWN_MS;
          },
        );
        for (const t of chunk) this.inflight.set(`${lang}\n${t}`, p);
        p.finally(() => chunk.forEach((t) => this.inflight.delete(`${lang}\n${t}`)));
        waiting.push(p);
      }
      await Promise.all(waiting);
    }
    const out: Record<string, string> = {};
    for (const t of want) if (t in cache) out[t] = cache[t];
    return out;
  }
}
