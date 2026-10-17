/**
 * Everything a person can do to the shared lists. Writes go straight to Firestore;
 * the offline cache shows them on screen at once and syncs when there is signal.
 */
import { deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import { post } from '../api';
import { cleanAisles, cleanPlan, cleanRoutes, cleanShop, cleanTodo, type Suggestion } from '../lib/aiClean';
import {
  catFor, colorOf, COLORS, guessCat, kbKey, learnEntry, parseDue, parseEntry, prepEntry, route, splitEntries, todayISO, todayLong, CATS,
} from '../lib/domain';
import { S, setS } from '../store/useStore';
import type { CatId, Entry, Item, List, ListKind, Pending, Receipt, RouteWhy } from '../types';
import { failed, itemRef, kbRef, listRef, newId } from './repo';
import { toast } from './toast';
import { confetti } from '../lib/confetti';

const me = () => S().user?.uid || null;
const listById = (id: string) => S().lists.find(l => l.id === id);
export const listItems = (listId: string) => S().items.filter(i => i.listId === listId);
const write = (p: Promise<unknown>) => { p.catch(failed); };

/* ---------- Knowledge base ---------- */
export function learn(text: string, listId: string | null, opts: { weight?: number; from?: string | null; cat?: CatId | null } = {}) {
  if (S().readOnly) return;
  const key = kbKey(text);
  const next = learnEntry(S().kb.get(key), text, listId, { ...opts, by: me(), listIds: new Set(S().lists.map(l => l.id)) });
  if (!next) return;
  const { id, ...body } = next;
  const kb = new Map(S().kb); kb.set(next.key, next); setS({ kb });
  write(setDoc(kbRef(id), body));
}
export function forget(key: string) {
  const e = S().kb.get(key); if (!e) return;
  const kb = new Map(S().kb); kb.delete(key); setS({ kb });
  write(deleteDoc(kbRef(e.id)));
}

/* ---------- Items ---------- */
export type AddResult = { id: string; status: 'new' | 'dup' | 'revived' } | null;

export function addItem(listId: string, raw: string, opts: { due?: string | null; quiet?: boolean; weight?: number } = {}): AddResult {
  const list = listById(listId); if (!list || !raw.trim()) return null;
  let { text, qty } = parseEntry(raw);
  let due = opts.due || null;
  if (list.kind === 'todo' && !due) { const d = parseDue(text); if (d.due) { text = d.text; due = d.due; } }
  const key = kbKey(text);
  const same = listItems(listId).find(i => kbKey(i.text) === key);
  if (same && !same.done) {
    if (!opts.quiet) { setS({ flashId: same.id }); toast(`${text} staat al op de lijst`); }
    if (qty && qty !== same.qty) write(updateDoc(itemRef(same.id), { qty }));
    return { id: same.id, status: 'dup' };
  }
  learn(text, listId, { weight: opts.weight || 1 });
  if (same && same.done) {
    const patch: Partial<Item> = { done: false, doneBy: null, doneAt: null, addedBy: me(), createdAt: Date.now() };
    if (qty) patch.qty = qty;
    if (due && list.kind === 'todo') patch.due = due;
    write(updateDoc(itemRef(same.id), patch));
    return { id: same.id, status: 'revived' };
  }
  const id = newId('items');
  const body: Omit<Item, 'id'> = {
    listId, text, qty, note: '', cat: list.kind === 'shop' ? catFor(text, S().kb) : null,
    done: false, doneBy: null, doneAt: null, urgent: false, due: list.kind === 'todo' ? due : null, assignee: null,
    addedBy: me(), createdAt: Date.now(),
  };
  write(setDoc(itemRef(id), body));
  if (list.kind === 'todo' && list.autoPlan !== false && S().aiOn) queuePlan(id, false, body.text);
  return { id, status: 'new' };
}

export function toggleItem(id: string, origin?: { x: number; y: number }) {
  const it = S().items.find(i => i.id === id); if (!it) return;
  const done = !it.done;
  write(updateDoc(itemRef(id), { done, doneBy: done ? me() : null, doneAt: done ? Date.now() : null }));
  if (done) setS({ popId: id });
  const others = listItems(it.listId).filter(i => i.id !== id);
  if (done && others.length >= 1 && others.every(i => i.done)) {
    confetti(origin?.x ?? innerWidth / 2, origin?.y ?? innerHeight / 2);
    toast(listById(it.listId)?.kind === 'shop' ? 'Alles in het mandje. Lekker bezig!' : 'Alles af. Mooi werk!');
  }
}

export function updateItem(id: string, patch: Partial<Item>) {
  write(updateDoc(itemRef(id), patch));
}

function rememberRecent(listId: string, texts: string[]) {
  const list = listById(listId); if (!list) return;
  const seen = new Set<string>(), recent: string[] = [];
  for (const t of [...texts, ...(list.recent || [])]) { const k = kbKey(t); if (!seen.has(k)) { seen.add(k); recent.push(t); } }
  write(updateDoc(listRef(listId), { recent: recent.slice(0, 40) }));
}

export function deleteItems(ids: string[], msg: string) {
  const backups = ids.map(id => S().items.find(i => i.id === id)).filter((x): x is Item => !!x);
  if (!backups.length) return;
  rememberRecent(backups[0].listId, backups.map(b => b.text));
  backups.forEach(b => write(deleteDoc(itemRef(b.id))));
  toast(msg, 'Ongedaan maken', () => {
    backups.forEach(({ id, ...body }) => write(setDoc(itemRef(id), body)));
  });
}

export function moveItem(itemId: string, toId: string) {
  const it = S().items.find(i => i.id === itemId), to = listById(toId);
  if (!it || !to || it.listId === toId) return;
  const from = it.listId;
  learn(it.text, toId, { weight: 2, from });
  const twin = listItems(toId).find(i => !i.done && i.id !== itemId && kbKey(i.text) === kbKey(it.text));
  setS({ receipt: S().receipt.map(r => r.itemId === itemId ? { ...r, listId: toId, why: 'user' as RouteWhy, itemId: twin ? twin.id : r.itemId } : r) });
  if (twin) {
    write(deleteDoc(itemRef(itemId)));
    toast(`${it.text} stond al op ${to.name}`);
  } else {
    const patch: Partial<Item> = { listId: toId, cat: to.kind === 'shop' ? catFor(it.text, S().kb) : null };
    if (to.kind !== 'todo') { patch.due = null; patch.assignee = null; }
    write(updateDoc(itemRef(itemId), patch));
    toast(`Verplaatst naar ${to.name}. Onthouden voor de volgende keer.`);
  }
}

export function addMany(listId: string, entries: Pick<Suggestion, 'text' | 'qty' | 'note' | 'cat' | 'due'>[], notePrefix = '') {
  const list = listById(listId); if (!list) return;
  const existing = listItems(listId); const t0 = Date.now();
  const created: string[] = []; let revived = 0;
  entries.forEach((e, n) => {
    const same = existing.find(i => kbKey(i.text) === kbKey(e.text));
    if (same && !same.done) return;
    if (same && same.done) {
      const patch: Partial<Item> = { done: false, doneBy: null, doneAt: null, addedBy: me(), createdAt: t0 + n };
      if (e.qty) patch.qty = e.qty;
      write(updateDoc(itemRef(same.id), patch)); revived++;
      return;
    }
    const id = newId('items');
    const body: Omit<Item, 'id'> = {
      listId, text: e.text, qty: e.qty || '', note: e.note || notePrefix || '',
      cat: list.kind === 'shop' ? (e.cat || catFor(e.text, S().kb)) : null,
      done: false, doneBy: null, doneAt: null, urgent: false, due: list.kind === 'todo' ? (e.due || null) : null, assignee: null,
      addedBy: me(), createdAt: t0 + n,
    };
    write(setDoc(itemRef(id), body)); created.push(id);
    learn(e.text, listId, { cat: list.kind === 'shop' && e.cat && e.cat !== guessCat(e.text) ? e.cat : null });
  });
  const n = created.length + revived;
  if (!n) { toast('Alles stond al op de lijst'); return; }
  toast(`${n} ${n === 1 ? 'item' : 'items'} toegevoegd`, created.length ? 'Ongedaan maken' : undefined,
    created.length ? () => created.forEach(id => write(deleteDoc(itemRef(id)))) : undefined);
}

/* ---------- Lists ---------- */
export function createList(name: string, kind: ListKind) {
  const used = new Set(S().lists.map(colorOf));
  const color = COLORS.find(c => !used.has(c)) || COLORS[S().lists.length % COLORS.length];
  const id = newId('lists');
  write(setDoc(listRef(id), { name: name.slice(0, 60), kind, color, recent: [], shopper: null, autoPlan: kind === 'todo', createdBy: me(), createdAt: Date.now() }));
  setS({ showNew: false });
  go(id);
}
export function updateList(id: string, patch: Partial<List>) {
  write(updateDoc(listRef(id), patch));
  if (patch.kind === 'shop') listItems(id).filter(i => !i.cat).forEach(i => write(updateDoc(itemRef(i.id), { cat: catFor(i.text, S().kb) })));
}
export function deleteList(id: string) {
  listItems(id).forEach(i => write(deleteDoc(itemRef(i.id))));
  write(deleteDoc(listRef(id)));
  setS({ sheet: null });
  go('home');
  toast('Lijst verwijderd');
}
export function setShopper(listId: string, on: boolean) {
  write(updateDoc(listRef(listId), { shopper: on ? { by: me(), at: Date.now() } : null }));
  if (on) toast('De anderen zien nu dat je boodschappen doet');
}

/** Open a list or go back home. Opening a list adds a history entry, so Android's back button returns home. */
export function go(view: string) {
  if (view === 'home') {
    if (history.state && history.state.sl) { history.back(); return; }
    setS({ view: 'home', onlyMine: false, sheet: null });
    return;
  }
  if (history.state && history.state.sl) history.replaceState({ sl: view }, '');
  else history.pushState({ sl: view }, '');
  setS({ view, onlyMine: false, sheet: null });
  window.scrollTo(0, 0);
}

/* ---------- Quick add: one box for every list ---------- */
function place(p: Entry, listId: string, why: RouteWhy, weight: number): Receipt | null {
  const l = listById(listId); if (!l) return null;
  const r = addItem(listId, (p.qty ? p.qty + ' ' : '') + p.text, { due: l.kind === 'todo' ? p.due : null, quiet: true, weight });
  if (!r) return null;
  return { itemId: r.id, listId, why: r.status === 'dup' ? 'dup' : why };
}
const pushReceipt = (rs: Receipt[]) =>
  setS({ receipt: [...rs, ...S().receipt.filter(x => !rs.some(y => y.itemId === x.itemId))].slice(0, 12) });

export function quickAdd(raw: string) {
  return quickAddEntries(splitEntries(raw).map(part => prepEntry(part, S().lists)));
}

export async function quickAddEntries(entries: Entry[]) {
  if (!S().lists.length) { toast('Maak eerst een lijst, dan weet Samenlijst waar dingen heen kunnen.'); return; }
  const placed: Receipt[] = [], unsure: Pending[] = [];
  for (const p of entries) {
    if (!p.key) continue;
    const r = route(p, S().lists, S().items, S().kb);
    if (r.listId) { const x = place(p, r.listId, r.why, 1); if (x) placed.push(x); }
    else unsure.push({ ...p, ranking: r.ranking, guess: r.guess || null, guessBy: r.guess ? 'rule' : null });
  }
  pushReceipt(placed);
  window.scrollTo(0, 0);
  if (!unsure.length) return;
  if (!S().aiOn) { setS({ pending: [...S().pending, ...unsure] }); return; }

  setS({ qaThinking: S().qaThinking + unsure.length });
  let routes: ReturnType<typeof cleanRoutes> | null = null;
  try {
    const lists = S().lists.map(l => ({ id: l.id, name: l.name, kind: l.kind, examples: listExamples(l.id) }));
    routes = cleanRoutes(await post('route-items', { lists, items: unsure.map(p => ({ text: p.text, due: p.due })), today: todayLong() }));
  } catch (e) { toast((e as Error).message); }
  setS({ qaThinking: Math.max(0, S().qaThinking - unsure.length) });
  const late: Receipt[] = [], still: Pending[] = [];
  const has = (id: string | null): id is string => !!id && S().lists.some(l => l.id === id);
  unsure.forEach((p, n) => {
    const a = routes?.[n];
    if (a && has(a.list) && a.confidence >= 0.8) { const x = place(p, a.list, 'ai', 1); if (x) late.push(x); }
    else {
      if (a && has(a.list)) { p.guess = a.list; p.guessBy = 'ai'; p.ranking = [a.list, ...p.ranking.filter(id => id !== a.list)]; }
      still.push(p);
    }
  });
  pushReceipt(late);
  setS({ pending: [...S().pending, ...still] });
}

function listExamples(id: string) {
  const out = new Set<string>();
  for (const e of S().kb.values()) {
    const vals = Object.values(e.lists || {});
    const n = (e.lists || {})[id] || 0;
    if (n && n === Math.max(...vals)) out.add(e.text);
    if (out.size >= 10) break;
  }
  (listById(id)?.recent || []).forEach(t => out.size < 14 && out.add(t));
  listItems(id).forEach(i => out.size < 18 && out.add(i.text));
  return [...out].slice(0, 18);
}

export function answerPending(pid: string, listId: string | null) {
  const p = S().pending.find(x => x.pid === pid); if (!p) return;
  setS({ pending: S().pending.filter(x => x.pid !== pid) });
  if (listId) { const x = place(p, listId, 'user', 2); if (x) pushReceipt([x]); }
}

/** Pick from the knowledge-base suggestion strip on the home screen. */
export function quickPick(typed: string, text: string, listId: string) {
  const p = prepEntry(typed || text, S().lists);
  p.text = text; p.key = kbKey(text);
  const x = place(p, listId, 'kb', 1);
  if (x) pushReceipt([x]);
}

/* ---------- Spraakmemo ---------- */
interface Heard { transcript: string; items: { text: string; qty: string; due: string | null }[] }

/** Send a recorded memo to the server; Gemini writes it out and splits it into items. */
export async function voiceMemo(audio: string, listId: string | null) {
  setS({ listening: true });
  try {
    const lists = S().lists.map(l => ({ id: l.id, name: l.name, kind: l.kind }));
    const raw = await post<Partial<Heard>>('voice-memo', { audio, lists, target: listId ? listById(listId)?.kind || null : null, today: todayLong() });
    const transcript = String(raw?.transcript || '').trim().slice(0, 500);
    const items = (Array.isArray(raw?.items) ? raw!.items : [])
      .map(x => ({ text: String(x?.text || '').trim().slice(0, 120), qty: String(x?.qty || '').trim().slice(0, 24), due: /^\d{4}-\d{2}-\d{2}$/.test(String(x?.due || '')) ? String(x!.due) : null }))
      .filter(x => x.text).slice(0, 25);
    setS({ heard: transcript || null });
    if (!items.length) { toast(transcript ? 'Ik hoorde niets om toe te voegen.' : 'Ik kon je niet verstaan. Probeer het nog eens, iets dichter bij de microfoon.'); return; }
    if (listId) {
      addMany(listId, items.map(i => ({ ...i, note: '', cat: null })));
    } else {
      const entries = items.map(i => {
        const p = prepEntry((i.qty ? i.qty + ' ' : '') + i.text, S().lists);
        if (i.due) { p.due = i.due; p.hasDate = true; }
        return p;
      });
      await quickAddEntries(entries);
    }
  } catch (e) {
    toast((e as Error).message);
  } finally {
    setS({ listening: false });
  }
}

/* ---------- AI: slim toevoegen, wat vergeet ik, afdelingen ---------- */
export async function smartSuggest(mode: 'add' | 'forgot', listId: string, text: string, image: string | null, signal?: AbortSignal): Promise<Suggestion[]> {
  const l = listById(listId)!;
  const open = listItems(listId).filter(i => !i.done);
  const openTxt = open.map(i => (i.qty ? i.qty + ' ' : '') + i.text);
  if (mode === 'forgot') {
    const data = await post('forgot', { open: openTxt, recent: (l.recent || []).slice(0, 30) }, signal);
    return cleanShop(data, open);
  }
  const data = await post('smart-add', { kind: l.kind, text: text.slice(0, 6000), image, existing: openTxt, today: todayLong() }, signal);
  return l.kind === 'shop' ? cleanShop(data, open) : cleanTodo(data, open);
}

export async function sortOverig(listId: string) {
  const items = listItems(listId).filter(i => !i.done && (i.cat || 'overig') === 'overig');
  if (!items.length) return;
  try {
    const map = cleanAisles(await post('sort-aisles', { items: items.map(i => i.text + (i.note ? ` (${i.note})` : '')) }));
    let moved = 0;
    items.forEach((i, n) => {
      const c = map[n];
      if (c && c !== 'overig') { moved++; write(updateDoc(itemRef(i.id), { cat: c })); learn(i.text, null, { cat: c }); }
    });
    toast(moved ? `${moved} ${moved === 1 ? 'item' : 'items'} naar de juiste afdeling` : 'Deze items horen echt bij Overig');
  } catch (e) { toast((e as Error).message); }
}

/* ---------- AI: taken uitwerken ---------- */
const planQueue: { id: string; text?: string }[] = [];
let planBusy = false;

export function queuePlan(id: string, force = false, text?: string) {
  if (!S().aiOn || S().planning.includes(id)) return;
  const it = S().items.find(i => i.id === id);
  if (it && it.plan && !force) return;
  planQueue.push({ id, text });
  setS({ planning: [...S().planning, id] });
  runPlanQueue();
}
async function runPlanQueue() {
  if (planBusy) return; planBusy = true;
  while (planQueue.length) {
    const job = planQueue.shift()!;
    try { await elaborate(job.id, job.text); } catch (e) { console.warn(e); }
    setS({ planning: S().planning.filter(x => x !== job.id) });
  }
  planBusy = false;
}
async function elaborate(id: string, fallbackText?: string) {
  // A just-created task may not be in the snapshot yet; wait briefly for it.
  let it = S().items.find(i => i.id === id);
  for (let n = 0; !it && n < 20; n++) { await new Promise(r => setTimeout(r, 150)); it = S().items.find(i => i.id === id); }
  const text = it?.text || fallbackText; if (!text) return;
  const l = it ? listById(it.listId) : undefined;
  const others = it ? listItems(it.listId).filter(i => !i.done && i.id !== id).map(i => i.text).slice(0, 25) : [];
  try {
    const data = await post('elaborate', { listName: l?.name || '', task: text, note: it?.note || '', due: it?.due || null, others, today: todayLong() });
    if (!S().items.some(i => i.id === id)) return;
    const plan = cleanPlan(data, me());
    if (!plan.detail && !plan.steps.length && !plan.tips.length && !plan.buy.length) return;
    setS({ planOpen: [...S().planOpen.filter(x => x !== id), id] });
    write(updateDoc(itemRef(id), { plan }));
  } catch (e) { toast((e as Error).message); }
}
export function planAddSteps(id: string) {
  const it = S().items.find(i => i.id === id); if (!it?.plan) return;
  const steps = it.plan.steps.map(st => ({ text: st.text, qty: '', note: '', cat: null, due: st.due || null }));
  if (!steps.length) return;
  addMany(it.listId, steps, `Onderdeel van: ${it.text}`.slice(0, 140));
  write(updateDoc(itemRef(id), { 'plan.stepsAdded': true }));
}
export function planAddBuy(id: string, listId: string) {
  const it = S().items.find(i => i.id === id); if (!it?.plan) return;
  const buy = it.plan.buy.map(b => ({ text: b.text, qty: b.qty || '', note: '', cat: null, due: null }));
  if (!buy.length) return;
  addMany(listId, buy, `Voor: ${it.text}`.slice(0, 140));
  write(updateDoc(itemRef(id), { 'plan.buyAdded': listId }));
}

export const togglePlanOpen = (id: string) =>
  setS({ planOpen: S().planOpen.includes(id) ? S().planOpen.filter(x => x !== id) : [...S().planOpen, id] });

export const today = todayISO;
export const CAT_OPTIONS = CATS.map(([id, label]) => ({ id, label }));
