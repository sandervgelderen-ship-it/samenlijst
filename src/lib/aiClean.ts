/** Turn whatever the AI server returned into safe, bounded data the app can store. */
import type { CatId, Item, Offer, Plan, PlanAnswer, PlanQuestion } from '../types';
import { cap, guessCat, isCat, isRule, kbKey } from './domain';

const str = (v: unknown, n: number) => String(v == null ? '' : v).trim().slice(0, n);
const arr = (d: unknown): unknown[] => {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') { const v = Object.values(d as object).find(Array.isArray); if (v) return v as unknown[]; }
  return [];
};
const obj = (x: unknown): Record<string, unknown> | null =>
  typeof x === 'string' ? { text: x } : x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
const isoDate = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

export interface Suggestion {
  text: string; qty: string; cat: CatId | null; due: string | null; note: string; why: string; pantry: boolean; on: boolean;
}

export function cleanShop(data: unknown, open: Pick<Item, 'text'>[]): Suggestion[] {
  const have = new Set(open.map(i => kbKey(i.text))), seen = new Set<string>(), out: Suggestion[] = [];
  for (const raw of arr(data)) {
    const r = obj(raw); if (!r) continue;
    const text = cap(str(r.text, 120)); if (!text) continue;
    const k = kbKey(text); if (have.has(k) || seen.has(k)) continue; seen.add(k);
    const pantry = r.pantry === true;
    out.push({ text, qty: str(r.qty, 24), cat: isCat(r.cat) ? r.cat : guessCat(text), due: null, note: str(r.note, 140), why: str(r.why, 80), pantry, on: !pantry });
    if (out.length >= 30) break;
  }
  return out;
}

export function cleanTodo(data: unknown, open: Pick<Item, 'text'>[]): Suggestion[] {
  const have = new Set(open.map(i => kbKey(i.text))), seen = new Set<string>(), out: Suggestion[] = [];
  for (const raw of arr(data)) {
    const r = obj(raw); if (!r) continue;
    const text = cap(str(r.text, 120)); if (!text) continue;
    const k = kbKey(text); if (have.has(k) || seen.has(k)) continue; seen.add(k);
    out.push({ text, qty: '', cat: null, due: isoDate(r.due), note: str(r.note, 140), why: '', pantry: false, on: true });
    if (out.length >= 15) break;
  }
  return out;
}

export function cleanQuestions(d: unknown): PlanQuestion[] {
  const o = d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>).questions : d;
  const out: PlanQuestion[] = [];
  for (const raw of arr(o)) {
    const q = obj(raw); if (!q) continue;
    const text = str(q.q ?? q.question, 140); if (!text) continue;
    const seen = new Set<string>();
    const options = arr(q.options).map(x => str(typeof x === 'string' ? x : obj(x)?.label ?? obj(x)?.text, 60))
      .filter(x => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
    if (options.length < 2) continue;
    out.push({ q: text, options, multi: q.multi === true });
    if (out.length >= 3) break;
  }
  return out;
}

export function cleanPlan(d: unknown, by: string | null, answers: PlanAnswer[] = []): Plan {
  const o = (d && typeof d === 'object' && !Array.isArray(d) ? d : {}) as Record<string, unknown>;
  const steps = arr(o.steps).map(obj).filter((x): x is Record<string, unknown> => !!x && !!str(x.text, 120)).slice(0, 6)
    .map(x => ({ text: cap(str(x.text, 120)), due: isoDate(x.due), ...(str(x.how, 240) ? { how: str(x.how, 240) } : {}) }));
  // No tips: the household wants details of the job itself, not suggestions around it.
  const tips: string[] = [];
  const buy = arr(o.buy).map(obj).filter((x): x is Record<string, unknown> => !!x && !!str(x.text, 80)).slice(0, 10)
    .map(x => ({ text: cap(str(x.text, 80)), qty: str(x.qty, 24) }));
  return { detail: str(o.detail, 700), answers, steps, tips, buy, at: Date.now(), by, stepsAdded: false, buyAdded: null };
}

export function cleanRoutes(data: unknown): Record<number, { list: string | null; confidence: number }> {
  const out: Record<number, { list: string | null; confidence: number }> = {};
  for (const raw of arr(data)) {
    const r = obj(raw); if (!r) continue;
    const i = Number(r.i); if (!Number.isInteger(i)) continue;
    out[i] = { list: typeof r.list === 'string' && r.list ? r.list : null, confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)) };
  }
  return out;
}

export function cleanAisles(data: unknown): Record<number, CatId> {
  const out: Record<number, CatId> = {};
  for (const raw of arr(data)) {
    const r = obj(raw); if (!r) continue;
    const i = Number(r.i);
    if (Number.isInteger(i) && isCat(r.cat)) out[i] = r.cat;
  }
  return out;
}

export interface Analysis { text: string; qty: string; note: string; cat: CatId | null; due: string | null; store: string | null; storeConf: number; repeat: string; list: string | null; confidence: number }

/** Per typed line (by index) the cleaned-up items the AI made of it; "melk en eieren" gives two. */
export function cleanAnalysis(data: unknown, count: number): Record<number, Analysis[]> {
  const out: Record<number, Analysis[]> = {};
  for (const raw of arr(data)) {
    const r = obj(raw); if (!r) continue;
    const i = Number(r.i); if (!Number.isInteger(i) || i < 0 || i >= count) continue;
    const text = cap(str(r.text, 120)); if (!text) continue;
    const list = (out[i] ||= []);
    if (list.length >= 6) continue;
    list.push({
      text, qty: str(r.qty, 24), note: str(r.note, 140), cat: isCat(r.cat) ? r.cat : null, due: isoDate(r.due),
      store: str(r.store, 30) || null, storeConf: Math.max(0, Math.min(1, Number(r.storeConfidence) || 0)), repeat: str(r.repeat, 40),
      list: typeof r.list === 'string' && r.list ? r.list : null, confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
    });
  }
  return out;
}

/** Rules Gemini derived from what the household did: only general preferences, never a single item. */
export function cleanRules(data: unknown): { text: string; topic: string; list: string | null }[] {
  const out: { text: string; topic: string; list: string | null }[] = [];
  const seen = new Set<string>();
  for (const raw of arr(data)) {
    const r = obj(raw); if (!r) continue;
    const text = cap(str(r.text, 160).replace(/[.]+$/, ''));
    if (!isRule(text)) continue;
    const k = kbKey(text); if (seen.has(k)) continue; seen.add(k);
    out.push({ text, topic: cap(str(r.topic, 30)), list: typeof r.list === 'string' && r.list ? r.list : null });
    if (out.length >= 3) break;
  }
  return out;
}

/** Offers Gemini found online: bounded, deduplicated, sorted with matches for the list first. */
export function cleanOffers(data: unknown): { week: string; stores: string[]; offers: Offer[] } {
  const o = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const rows = Array.isArray(data) ? data : arr(o.offers);
  const seen = new Set<string>(), offers: Offer[] = [];
  for (const raw of rows) {
    const r = obj(raw); if (!r) continue;
    const product = cap(str(r.product ?? r.text, 100)), store = cap(str(r.store, 40));
    if (!product || !store) continue;
    const k = kbKey(store + ' ' + product); if (seen.has(k)) continue; seen.add(k);
    offers.push({
      store, product, deal: str(r.deal, 60), price: str(r.price, 20), until: isoDate(r.until),
      match: cap(str(r.match, 100)), cat: isCat(r.cat) ? r.cat : guessCat(product),
    });
    if (offers.length >= 40) break;
  }
  offers.sort((a, b) => (b.match ? 1 : 0) - (a.match ? 1 : 0));
  const stores = [...new Set([...arr(o.stores).map(x => cap(str(x, 40))).filter(Boolean), ...offers.map(x => x.store)])].slice(0, 12);
  return { week: str(o.week, 60), stores, offers };
}

/**
 * Offers searched per supermarket (one search each, so a big chain cannot crowd out the others), put together:
 * list matches first, then the rest taken in turns per supermarket, so every chosen one keeps its share.
 */
export function mergeOffers(parts: { week: string; stores: string[]; offers: Offer[] }[], chosen: string[] = []) {
  const seen = new Set<string>(), offers: Offer[] = [];
  for (const p of parts) for (const o of p.offers) {
    const k = kbKey(o.store + ' ' + o.product); if (seen.has(k)) continue; seen.add(k); offers.push(o);
  }
  const found = new Set(offers.map(o => o.store));
  const stores = [...new Set([...chosen.filter(s => found.has(s)), ...parts.flatMap(p => p.stores).filter(s => found.has(s)), ...found])].slice(0, 12);
  const matched = offers.filter(o => o.match);
  const queues = stores.map(s => offers.filter(o => !o.match && o.store === s));
  const rest: Offer[] = [];
  for (let n = 0; queues.some(q => n < q.length); n++) queues.forEach(q => { if (q[n]) rest.push(q[n]); });
  return { week: parts.find(p => p.week)?.week || '', stores, offers: [...matched, ...rest].slice(0, 100) };
}

/** JSON from a free-text model answer: the whole text, a ```json block, or the first {...} / [...] in it. */
export function parseLoose(text: string): unknown {
  const out = String(text || '').trim();
  try { return JSON.parse(out); } catch { /* try a fragment */ }
  const m = out.match(/```(?:json)?\s*([\s\S]*?)```/) || out.match(/([\[{][\s\S]*[\]}])/);
  if (m) { try { return JSON.parse(m[1]); } catch { /* give up */ } }
  return {};
}

/** The web pages a Google Search-grounded answer used (Gemini groundingMetadata), deduplicated. */
export function groundingSources(meta: unknown): { title: string; uri: string }[] {
  const chunks = (meta as { groundingChunks?: { web?: { uri?: string; title?: string; domain?: string } }[] } | null)?.groundingChunks;
  const seen = new Set<string>(), out: { title: string; uri: string }[] = [];
  for (const c of Array.isArray(chunks) ? chunks : []) {
    const uri = String(c?.web?.uri || '');
    if (!/^https?:\/\//.test(uri) || seen.has(uri)) continue;
    seen.add(uri);
    out.push({ title: String(c?.web?.title || c?.web?.domain || uri).slice(0, 80), uri });
    if (out.length >= 8) break;
  }
  return out;
}
