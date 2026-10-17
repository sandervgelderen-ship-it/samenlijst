/** Turn whatever the AI server returned into safe, bounded data the app can store. */
import type { CatId, Item, Plan, PlanAnswer, PlanQuestion } from '../types';
import { cap, guessCat, isCat, kbKey } from './domain';

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
    out.push({ text, qty: str(r.qty, 24), cat: isCat(r.cat) ? r.cat : guessCat(text), due: null, note: '', why: str(r.why, 80), pantry, on: !pantry });
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
  const steps = arr(o.steps).map(obj).filter((x): x is Record<string, unknown> => !!x && !!str(x.text, 120)).slice(0, 5)
    .map(x => ({ text: cap(str(x.text, 120)), due: isoDate(x.due) }));
  const tips = arr(o.tips).map(t => str(typeof t === 'string' ? t : obj(t)?.text, 220)).filter(Boolean).slice(0, 2);
  const buy = arr(o.buy).map(obj).filter((x): x is Record<string, unknown> => !!x && !!str(x.text, 80)).slice(0, 10)
    .map(x => ({ text: cap(str(x.text, 80)), qty: str(x.qty, 24) }));
  return { detail: str(o.detail, 400), answers, steps, tips, buy, at: Date.now(), by, stepsAdded: false, buyAdded: null };
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

export interface Analysis { text: string; qty: string; note: string; cat: CatId | null; due: string | null; list: string | null; confidence: number }

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
      list: typeof r.list === 'string' && r.list ? r.list : null, confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
    });
  }
  return out;
}
