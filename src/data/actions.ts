/**
 * Everything a person can do to the shared lists. Writes go straight to Firestore;
 * the offline cache shows them on screen at once and syncs when there is signal.
 */
import { deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import { post } from '../api';
import { cleanAisles, cleanAnalysis, cleanOffers, cleanPlan, cleanPrices, mergeOffers, cleanQuestions, cleanRules, cleanShop, cleanTodo, type Analysis, type Suggestion } from '../lib/aiClean';
import {
  CAT_LABEL, catFor, colorOf, COLORS, decideStore, dueInfo, isSuper, kbKey, sameStore, knownStore, makeMemory, memoryLines, nextDue, normStore, parseDue, parseEntry, parseRepeat, pickCat, prepEntry, route, splitEntries, storeOptions, todayISO, todayLong, CATS, type Repeat,
} from '../lib/domain';
import { S, setS } from '../store/useStore';
import type { CatId, Entry, Item, ItemPrice, List, ListKind, Memory, OfferResult, PlanAnswer, Pending, Receipt, RouteWhy, StoreAsk } from '../types';
import { hRef, itemRef, kbRef, listRef, newId, safeWrite } from './repo';
import { toast } from './toast';
import { confetti } from '../lib/confetti';

const me = () => S().user?.uid || null;
const listById = (id: string) => S().lists.find(l => l.id === id);
export const listItems = (listId: string) => S().items.filter(i => i.listId === listId);
const write = (op: () => Promise<unknown>) => { void safeWrite(op); };

/* ---------- Geheugen: general preferences and agreements, never single items ----------
 * The memory holds metadata about the household ("Schoonmaakproducten moeten ecologisch zijn",
 * "Klusspullen horen op de lijst Klussen"). People add rules themselves; Gemini also derives them
 * from corrections and choices. Every AI call gets the memory, so the rules apply to new items,
 * plans and suggestions. Stored in the kb collection with kind 'rule' (no new security rules needed). */
const listIds = () => new Set(S().lists.map(l => l.id));
/** The memory as prompt lines. */
export const memoryForAi = () => memoryLines(S().memory, S().lists);

/** Save a rule. Returns it, or null when it is empty, not a rule, or already known. */
export function remember(text: string, opts: { topic?: string; list?: string | null; source?: Memory['source']; from?: string; quiet?: boolean } = {}): Memory | null {
  if (S().readOnly) return null;
  const body = makeMemory(text, S().memory, { topic: opts.topic, list: opts.list, listIds: listIds(), source: opts.source || 'zelf', from: opts.from, by: me() });
  if (!body) { if (!opts.quiet) toast('Dat weet Samenlijst al.'); return null; }
  const id = newId('kb');
  const m: Memory = { ...body, id };
  setS({ memory: [m, ...S().memory] });
  write(() => setDoc(kbRef(id), body));
  return m;
}
export function rewordMemory(id: string, text: string) {
  const t = text.trim().replace(/\s+/g, ' ').slice(0, 160);
  const m = S().memory.find(x => x.id === id);
  if (!m || t.length < 3 || t === m.text) return;
  setS({ memory: S().memory.map(x => x.id === id ? { ...x, text: t, at: Date.now() } : x) });
  write(() => updateDoc(kbRef(id), { text: t, at: Date.now(), by: me() }));
}
export function forgetMemory(id: string) {
  const m = S().memory.find(x => x.id === id); if (!m) return;
  setS({ memory: S().memory.filter(x => x.id !== id) });
  write(() => deleteDoc(kbRef(id)));
  toast('Vergeten', 'Ongedaan maken', () => { const { id: _, ...body } = m; setS({ memory: [m, ...S().memory] }); write(() => setDoc(kbRef(id), body)); });
}
/** Remove the single items the former knowledge base kept; the memory itself stays. */
export function clearOldKb() {
  const ids = S().oldKb; if (!ids.length) return;
  setS({ oldKb: [] });
  ids.forEach(id => write(() => deleteDoc(kbRef(id))));
  toast(`${ids.length} losse items uit de oude kennisbank opgeruimd`);
}

/* Each correction or choice may teach a general rule; Gemini decides whether it does. Batched, in the background. */
const lessons: string[] = [];
let learning: ReturnType<typeof setTimeout> | null = null;
export function learnFrom(event: string) {
  if (!S().aiOn || S().readOnly || !event) return;
  lessons.push(event.slice(0, 300));
  if (!learning) learning = setTimeout(runLessons, 4000);
}
async function runLessons() {
  learning = null;
  const events = lessons.splice(0, 6);
  if (!events.length) return;
  try {
    const lists = S().lists.map(l => ({ id: l.id, name: l.name, kind: l.kind }));
    const rules = cleanRules(await post('learn', { lists, memory: memoryForAi(), events }));
    const saved = rules.map(r => remember(r.text, { topic: r.topic, list: r.list, source: 'geleerd', from: events.join(' · '), quiet: true })).filter((m): m is Memory => !!m);
    if (saved.length === 1) toast(`Onthouden: ${saved[0].text}`, 'Vergeet', () => forgetMemory(saved[0].id));
    else if (saved.length > 1) toast(`${saved.length} voorkeuren onthouden`, 'Bekijk', () => setS({ sheet: { kind: 'kb' } }));
  } catch (e) { console.warn(e); }
  if (lessons.length && !learning) learning = setTimeout(runLessons, 4000);
}

/* ---------- Items ---------- */
export type AddResult = { id: string; status: 'new' | 'dup' | 'revived' } | null;

type StoreHint = { store?: string | null; storeConf?: number; aiStore?: boolean };
export function addItem(listId: string, raw: string, opts: { due?: string | null; quiet?: boolean; weight?: number; note?: string; cat?: CatId | null; repeat?: string } & StoreHint = {}): AddResult {
  const list = listById(listId); if (!list || !raw.trim()) return null;
  let { text, qty } = parseEntry(raw);
  let due = opts.due || null;
  let note = String(opts.note || '');
  // Tasks that come back: "elke week" in the text, from the AI, or as the note ("Elke week").
  let repeat: Repeat | null = null;
  if (list.kind === 'todo') {
    const fromText = parseRepeat(text), fromAi = parseRepeat(opts.repeat || ''), fromNote = parseRepeat(note);
    const r = fromText.repeat ? fromText : fromAi.repeat ? fromAi : fromNote;
    if (r.repeat) {
      repeat = r.repeat;
      if (r === fromText) text = r.text;
      if (fromNote.repeat) note = kbKey(fromNote.text) === kbKey(note) ? '' : fromNote.text;
      if (!due && r.due) due = r.due;
    }
  }
  if (list.kind === 'todo' && !due) { const d = parseDue(text); if (d.due) { text = d.text; due = d.due; } }
  const key = kbKey(text);
  const same = listItems(listId).find(i => kbKey(i.text) === key);
  if (same && !same.done) {
    if (!opts.quiet) { setS({ flashId: same.id }); toast(`${text} staat al op de lijst`); }
    if (qty && qty !== same.qty) write(() => updateDoc(itemRef(same.id), { qty }));
    return { id: same.id, status: 'dup' };
  }
  // Groceries: where is it bought? Where they bought it before wins, then a confident AI (which knows the memory); when it doubts, ask.
  const where = list.kind === 'shop'
    ? decideStore(knownStore(text, S().items), opts.aiStore ? { store: opts.store, conf: opts.storeConf } : null)
    : { store: null, ask: false, guess: null };
  if (same && same.done) {
    const patch: Partial<Item> = { done: false, doneBy: null, doneAt: null, addedBy: me(), createdAt: Date.now() };
    if (qty) patch.qty = qty;
    if (due && list.kind === 'todo') patch.due = due;
    write(() => updateDoc(itemRef(same.id), patch));
    return { id: same.id, status: 'revived' };
  }
  const id = newId('items');
  const body: Omit<Item, 'id'> = {
    listId, text, qty, note: note.slice(0, 140), cat: list.kind === 'shop' ? pickCat(text, S().items, opts.cat) : null,
    done: false, doneBy: null, doneAt: null, urgent: false, due: list.kind === 'todo' ? due : null, assignee: null,
    addedBy: me(), createdAt: Date.now(),
  };
  if (where.store) body.store = where.store;
  if (repeat) body.repeat = repeat;
  write(() => setDoc(itemRef(id), body));
  if (where.ask) askStore(id, listId, text, where.guess);
  if (list.kind === 'shop') queuePrices(id);
  if (list.kind === 'todo' && list.autoPlan !== false && S().aiOn) queuePlan(id, false, body.text);
  return { id, status: 'new' };
}

/* ---------- Waar koop je dit? ---------- */
/** Shops this household uses, from what is on the lists. */
export function usedStores(): string[] {
  return S().items.map(i => i.store).filter((x): x is string => !!x);
}
function askStore(itemId: string, listId: string, text: string, guess: string | null) {
  const ask: StoreAsk = { aid: newId('items'), itemId, listId, text, guess, options: storeOptions(guess, usedStores()) };
  setS({ storeAsks: [...S().storeAsks.filter(a => a.itemId !== itemId), ask] });
}
/** The answer goes on the item; Gemini may make a general rule of it ("Dierenvoer koop je bij de dierenwinkel"). */
export function answerStore(aid: string, store: string | null) {
  const a = S().storeAsks.find(x => x.aid === aid); if (!a) return;
  setS({ storeAsks: S().storeAsks.filter(x => x.aid !== aid) });
  const n = normStore(store); if (!n) return;
  const it = S().items.find(i => i.id === a.itemId);
  if (it) write(() => updateDoc(itemRef(it.id), { store: n }));
  learnFrom(`Gevraagd waar "${it?.text || a.text}" gekocht wordt; antwoord: ${n}${a.guess && normStore(a.guess) !== n ? ` (Gemini dacht ${a.guess})` : ''}.`);
}
/** Change where an item is bought (item sheet): may teach a general rule. */
export function setStore(itemId: string, store: string | null) {
  const it = S().items.find(i => i.id === itemId); if (!it) return;
  const n = normStore(store) || 'Supermarkt';
  write(() => updateDoc(itemRef(itemId), { store: n }));
  learnFrom(`"${it.text}" aangepast: kopen bij ${n} in plaats van ${normStore(it.store) || 'Supermarkt'}.`);
  setS({ storeAsks: S().storeAsks.filter(a => a.itemId !== itemId) });
}

export function toggleItem(id: string, origin?: { x: number; y: number }) {
  const it = S().items.find(i => i.id === id); if (!it) return;
  const done = !it.done;
  const patch: Partial<Item> = { done, doneBy: done ? me() : null, doneAt: done ? Date.now() : null };
  // A task that comes back: ticking it off puts the next one on the list; unticking takes that one away again.
  // Older tasks only have it in the note ("Elke week").
  const rep = it.repeat || parseRepeat(it.note || '').repeat || parseRepeat(it.text).repeat;
  if (done && rep && listById(it.listId)?.kind === 'todo') {
    const today = todayISO();
    let due = nextDue(it.due || today, rep);
    while (due <= today) due = nextDue(due, rep);
    const nextId = newId('items');
    const body: Omit<Item, 'id'> = {
      listId: it.listId, text: it.text, qty: it.qty || '', note: it.note || '', cat: null,
      done: false, doneBy: null, doneAt: null, urgent: false, due, assignee: it.assignee || null,
      addedBy: it.addedBy || me(), createdAt: Date.now(), repeat: rep,
      ...(it.plan ? { plan: it.plan } : {}),
    };
    write(() => setDoc(itemRef(nextId), body));
    patch.nextId = nextId;
    toast(`De volgende keer staat erop: ${dueInfo(due).label.toLowerCase()}`);
  } else if (!done && it.nextId) {
    const next = S().items.find(i => i.id === it.nextId);
    if (next && !next.done) write(() => deleteDoc(itemRef(next.id)));
    patch.nextId = null;
  }
  write(() => updateDoc(itemRef(id), patch));
  if (done) setS({ popId: id });
  const others = listItems(it.listId).filter(i => i.id !== id);
  if (done && others.length >= 1 && others.every(i => i.done)) {
    confetti(origin?.x ?? innerWidth / 2, origin?.y ?? innerHeight / 2);
    toast(listById(it.listId)?.kind === 'shop' ? 'Alles in het mandje. Lekker bezig!' : 'Alles af. Mooi werk!');
  }
}

export function updateItem(id: string, patch: Partial<Item>) {
  write(() => updateDoc(itemRef(id), patch));
}

function rememberRecent(listId: string, texts: string[]) {
  const list = listById(listId); if (!list) return;
  const seen = new Set<string>(), recent: string[] = [];
  for (const t of [...texts, ...(list.recent || [])]) { const k = kbKey(t); if (!seen.has(k)) { seen.add(k); recent.push(t); } }
  write(() => updateDoc(listRef(listId), { recent: recent.slice(0, 40) }));
}

export function deleteItems(ids: string[], msg: string) {
  const backups = ids.map(id => S().items.find(i => i.id === id)).filter((x): x is Item => !!x);
  if (!backups.length) return;
  rememberRecent(backups[0].listId, backups.map(b => b.text));
  backups.forEach(b => write(() => deleteDoc(itemRef(b.id))));
  toast(msg, 'Ongedaan maken', () => {
    backups.forEach(({ id, ...body }) => write(() => setDoc(itemRef(id), body)));
  });
}

export function moveItem(itemId: string, toId: string) {
  const it = S().items.find(i => i.id === itemId), to = listById(toId);
  if (!it || !to || it.listId === toId) return;
  const from = it.listId;
  learnFrom(`"${it.text}" verplaatst van de lijst "${listById(from)?.name || ''}" naar "${to.name}".`);
  const twin = listItems(toId).find(i => !i.done && i.id !== itemId && kbKey(i.text) === kbKey(it.text));
  setS({ receipt: S().receipt.map(r => r.itemId === itemId ? { ...r, listId: toId, why: 'user' as RouteWhy, itemId: twin ? twin.id : r.itemId } : r) });
  if (twin) {
    write(() => deleteDoc(itemRef(itemId)));
    toast(`${it.text} stond al op ${to.name}`);
  } else {
    const patch: Partial<Item> = { listId: toId, cat: to.kind === 'shop' ? catFor(it.text, S().items) : null };
    if (to.kind !== 'todo') { patch.due = null; patch.assignee = null; }
    write(() => updateDoc(itemRef(itemId), patch));
    toast(`Verplaatst naar ${to.name}`);
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
      write(() => updateDoc(itemRef(same.id), patch)); revived++;
      return;
    }
    const id = newId('items');
    const body: Omit<Item, 'id'> = {
      listId, text: e.text, qty: e.qty || '', note: e.note || notePrefix || '',
      cat: list.kind === 'shop' ? (e.cat || catFor(e.text, S().items)) : null,
      done: false, doneBy: null, doneAt: null, urgent: false, due: list.kind === 'todo' ? (e.due || null) : null, assignee: null,
      addedBy: me(), createdAt: t0 + n,
    };
    write(() => setDoc(itemRef(id), body)); created.push(id);
    if (list.kind === 'shop') queuePrices(id);
  });
  const n = created.length + revived;
  if (!n) { toast('Alles stond al op de lijst'); return; }
  toast(`${n} ${n === 1 ? 'item' : 'items'} toegevoegd`, created.length ? 'Ongedaan maken' : undefined,
    created.length ? () => created.forEach(id => write(() => deleteDoc(itemRef(id)))) : undefined);
}

/* ---------- Lists ---------- */
export function createList(name: string, kind: ListKind) {
  const used = new Set(S().lists.map(colorOf));
  const color = COLORS.find(c => !used.has(c)) || COLORS[S().lists.length % COLORS.length];
  const id = newId('lists');
  write(() => setDoc(listRef(id), { name: name.slice(0, 60), kind, color, recent: [], shopper: null, autoPlan: kind === 'todo', createdBy: me(), createdAt: Date.now() }));
  setS({ showNew: false });
  go(id);
}
export function updateList(id: string, patch: Partial<List>) {
  write(() => updateDoc(listRef(id), patch));
  if (patch.kind === 'shop') listItems(id).filter(i => !i.cat).forEach(i => write(() => updateDoc(itemRef(i.id), { cat: catFor(i.text, S().items) })));
}
export function deleteList(id: string) {
  listItems(id).forEach(i => write(() => deleteDoc(itemRef(i.id))));
  write(() => deleteDoc(listRef(id)));
  setS({ sheet: null });
  go('home');
  toast('Lijst verwijderd');
}
export function setShopper(listId: string, on: boolean) {
  write(() => updateDoc(listRef(listId), { shopper: on ? { by: me(), at: Date.now() } : null }));
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
function place(p: Entry, listId: string, why: RouteWhy): Receipt | null {
  const l = listById(listId); if (!l) return null;
  const r = addItem(listId, (p.qty ? p.qty + ' ' : '') + p.text, {
    due: l.kind === 'todo' ? p.due : null, quiet: true, note: p.note, cat: p.cat,
    store: p.store, storeConf: p.storeConf, aiStore: p.store !== undefined, repeat: p.repeat,
  });
  if (!r) return null;
  return { itemId: r.id, listId, why: r.status === 'dup' ? 'dup' : why };
}
const pushReceipt = (rs: Receipt[]) =>
  setS({ receipt: [...rs, ...S().receipt.filter(x => !rs.some(y => y.itemId === x.itemId))].slice(0, 12) });

export function quickAdd(raw: string) {
  return quickAddEntries(splitEntries(raw).map(part => prepEntry(part, S().lists)));
}

/* ---------- Every new item is analysed by AI first ----------
 * Gemini cleans up the name, pulls out amount, date and details, picks the aisle,
 * splits "melk en eieren" and proposes a list, following the household's memory
 * (general preferences). What the lists themselves show (it was on a list before) still decides when it is clear.
 * Without AI, or when it fails, the local rules take over: adding never blocks. */
function ruleRoute(p: Entry, placed: Receipt[], unsure: Pending[]) {
  const r = route(p, S().lists, S().items);
  if (r.listId) { const x = place(p, r.listId, r.why); if (x) placed.push(x); }
  else unsure.push({ ...p, ranking: r.ranking, guess: r.guess || null, guessBy: r.guess ? 'rule' : null });
}

async function analyze(entries: Entry[], fixedList: string | null): Promise<Record<number, Analysis[]> | null> {
  const ghosts = entries.map(p => ({ pid: p.pid, text: p.raw || p.text, listId: fixedList }));
  setS({ analyzing: [...S().analyzing, ...ghosts] });
  try {
    const lists = S().lists.map(l => ({ id: l.id, name: l.name, kind: l.kind, examples: listExamples(l.id) }));
    const stores = [...new Set(usedStores().map(normStore).filter((x): x is string => !!x && !isSuper(x)))].slice(0, 12);
    const data = await post('analyze', { lists, fixedList, memory: memoryForAi(), stores, items: entries.map(p => p.raw || p.text), today: todayLong() });
    return cleanAnalysis(data, entries.length);
  } catch (e) {
    toast((e as Error).message);
    return null;
  } finally {
    setS({ analyzing: S().analyzing.filter(g => !ghosts.includes(g)) });
  }
}

export async function quickAddEntries(entries: Entry[], opts: { analyzed?: boolean } = {}) {
  if (!S().lists.length) { toast('Maak eerst een lijst, dan weet Samenlijst waar dingen heen kunnen.'); return; }
  entries = entries.filter(p => p.key);
  if (!entries.length) return;
  const placed: Receipt[] = [], unsure: Pending[] = [];
  const res = S().aiOn && !opts.analyzed ? (window.scrollTo(0, 0), await analyze(entries, null)) : null;
  const has = (id: string | null): id is string => !!id && S().lists.some(l => l.id === id);
  entries.forEach((part, n) => {
    const outs = res?.[n];
    if (!outs?.length) { ruleRoute(part, placed, unsure); return; }
    outs.forEach((o, k) => {
      const text = o.text || part.text, due = o.due || part.due;
      const p: Entry = { ...part, pid: `${part.pid}-${k}`, text, qty: o.qty || part.qty, due, hasDate: !!due, key: kbKey(text), note: o.note, cat: o.cat, store: o.store, storeConf: o.storeConf, repeat: o.repeat };
      if (has(part.explicit)) { const x = place(p, part.explicit, 'explicit'); if (x) placed.push(x); return; }
      const r = route(p, S().lists, S().items);
      const aiList = has(o.list) ? o.list : null;
      if (r.listId && (r.why === 'hist' || r.why === 'dup' || r.why === 'only')) { const x = place(p, r.listId, r.why); if (x) placed.push(x); }
      else if (aiList && o.confidence >= 0.75) { const x = place(p, aiList, 'ai'); if (x) placed.push(x); }
      else if (r.listId) { const x = place(p, r.listId, r.why); if (x) placed.push(x); }
      else {
        const ranking = aiList ? [aiList, ...r.ranking.filter(id => id !== aiList)] : r.ranking;
        unsure.push({ ...p, ranking, guess: aiList || r.guess || null, guessBy: aiList ? 'ai' : r.guess ? 'rule' : null });
      }
    });
  });
  pushReceipt(placed);
  if (unsure.length) setS({ pending: [...S().pending, ...unsure] });
  window.scrollTo(0, 0);
}

/** Adding inside a list: the list is chosen, the AI still cleans up each entry first. */
export async function listAdd(listId: string, raw: string) {
  const entries = splitEntries(raw).map(part => prepEntry(part, S().lists)).filter(p => p.key);
  if (!entries.length) return;
  const res = S().aiOn ? await analyze(entries, listId) : null;
  if (!listById(listId)) return;
  entries.forEach((part, n) => {
    const outs = res?.[n];
    if (!outs?.length) { addItem(listId, (part.qty ? part.qty + ' ' : '') + part.text, { due: part.due }); return; }
    outs.forEach(o => {
      const text = o.text || part.text, qty = o.qty || part.qty;
      addItem(listId, (qty ? qty + ' ' : '') + text, { due: o.due || part.due, note: o.note, cat: o.cat, store: o.store, storeConf: o.storeConf, aiStore: true, repeat: o.repeat });
    });
  });
}

function listExamples(id: string) {
  const out = new Set<string>();
  (listById(id)?.recent || []).forEach(t => out.size < 12 && out.add(t));
  listItems(id).forEach(i => out.size < 18 && out.add(i.text));
  return [...out].slice(0, 18);
}

export function answerPending(pid: string, listId: string | null) {
  const p = S().pending.find(x => x.pid === pid); if (!p) return;
  setS({ pending: S().pending.filter(x => x.pid !== pid) });
  if (!listId) return;
  const x = place(p, listId, 'user'); if (x) pushReceipt([x]);
  const to = listById(listId)?.name || '', guess = p.guess && p.guess !== listId ? listById(p.guess)?.name : null;
  learnFrom(`Gemini twijfelde waar "${p.text}" op moest${guess ? ` (dacht "${guess}")` : ''}; gekozen: de lijst "${to}".`);
}

/** Pick from the suggestion strip on the home screen (things that were on a list before). */
export function quickPick(typed: string, text: string, listId: string) {
  const p = prepEntry(typed || text, S().lists);
  p.text = text; p.key = kbKey(text);
  const x = place(p, listId, 'hist');
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
    const data = await post('forgot', { open: openTxt, recent: (l.recent || []).slice(0, 30), memory: memoryForAi() }, signal);
    return cleanShop(data, open);
  }
  const data = await post('smart-add', { kind: l.kind, text: text.slice(0, 6000), image, existing: openTxt, memory: memoryForAi(), today: todayLong() }, signal);
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
      if (c && c !== 'overig') { moved++; write(() => updateDoc(itemRef(i.id), { cat: c })); }
    });
    toast(moved ? `${moved} ${moved === 1 ? 'item' : 'items'} naar de juiste afdeling` : 'Deze items horen echt bij Overig');
  } catch (e) { toast((e as Error).message); }
}

/* ---------- AI: taken uitwerken (eerst vragen, dan het plan) ---------- */
type PlanJob = { id: string; mode: 'ask' | 'plan'; text?: string; answers?: PlanAnswer[]; extra?: string; force?: boolean };
const planQueue: PlanJob[] = [];
let planBusy = false;

function startJob(job: PlanJob) {
  planQueue.push(job);
  setS({ planning: [...S().planning.filter(x => x !== job.id), job.id], planMode: { ...S().planMode, [job.id]: job.mode } });
  runPlanQueue();
}
export function queuePlan(id: string, force = false, text?: string) {
  if (!S().aiOn || S().planning.includes(id)) return;
  const it = S().items.find(i => i.id === id);
  if (it && (it.plan || it.planQ) && !force) return;
  startJob({ id, mode: 'ask', text, force });
}
/** The household answered the questions (or skipped them): make the plan. */
export function submitAnswers(id: string, skip: boolean) {
  const it = S().items.find(i => i.id === id);
  if (!it || !S().aiOn || S().planning.includes(id)) return;
  const qs = it.planQ?.questions || [];
  const sel = S().qaSel[id] || { picks: {}, extra: '' };
  const answers = skip ? [] : qs.map((q, qi) => ({ q: q.q, a: (sel.picks[qi] || []).map(oi => q.options[oi]).filter(Boolean).join(', ') })).filter(a => a.a);
  const extra = skip ? '' : sel.extra.trim().slice(0, 200);
  setS({ planOpen: [...S().planOpen.filter(x => x !== id), id] });
  startJob({ id, mode: 'plan', answers, extra, force: true });
  if (answers.length || extra) learnFrom(`Bij de taak "${it.text}" vertelden ze: ${[...answers.map(a => `${a.q} ${a.a}`), extra ? `verder: ${extra}` : ''].filter(Boolean).join('; ')}.`);
}
export function pickAnswer(id: string, qi: number, oi: number) {
  const q = S().items.find(i => i.id === id)?.planQ?.questions[qi]; if (!q) return;
  const prev = S().qaSel[id] || { picks: {}, extra: '' };
  const cur = prev.picks[qi] || [];
  const next = q.multi ? (cur.includes(oi) ? cur.filter(x => x !== oi) : [...cur, oi]) : (cur.includes(oi) ? [] : [oi]);
  setS({ qaSel: { ...S().qaSel, [id]: { ...prev, picks: { ...prev.picks, [qi]: next } } } });
}
export function setExtra(id: string, extra: string) {
  const prev = S().qaSel[id] || { picks: {}, extra: '' };
  setS({ qaSel: { ...S().qaSel, [id]: { ...prev, extra } } });
}
async function runPlanQueue() {
  if (planBusy) return; planBusy = true;
  while (planQueue.length) {
    const job = planQueue.shift()!;
    try { job.mode === 'ask' ? await askQuestions(job.id, job.text, !!job.force) : await makePlan(job.id, job.answers || [], job.extra || '', !!job.force); }
    catch (e) { console.warn(e); }
    const { [job.id]: _, ...planMode } = S().planMode;
    setS({ planning: S().planning.filter(x => x !== job.id), planMode });
  }
  planBusy = false;
}
async function taskFor(id: string, fallbackText?: string) {
  // A just-created task may not be in the snapshot yet; wait briefly for it.
  let it = S().items.find(i => i.id === id);
  for (let n = 0; !it && n < 20; n++) { await new Promise(r => setTimeout(r, 150)); it = S().items.find(i => i.id === id); }
  const text = it?.text || fallbackText; if (!text) return null;
  const l = it ? listById(it.listId) : undefined;
  const others = it ? listItems(it.listId).filter(i => !i.done && i.id !== id).map(i => i.text).slice(0, 25) : [];
  return { listName: l?.name || '', task: text, note: it?.note || '', due: it?.due || null, others, memory: memoryForAi(), today: todayLong() };
}
/** force = someone asked for it (pencil › Werk uit, Opnieuw uitwerken); otherwise the AI may decide it is not worth it. */
async function askQuestions(id: string, fallbackText?: string, force = false) {
  const ctx = await taskFor(id, fallbackText); if (!ctx) return;
  try {
    const data = await post<{ worth?: boolean }>('questions', { ...ctx, force });
    const questions = cleanQuestions(data);
    const cur = S().items.find(i => i.id === id); if (!cur) return;
    // An everyday chore ("stofzuigen") is not worth working out: leave the task as it is.
    if (!force && data && data.worth === false) return;
    if (!questions.length) { await makePlan(id, [], '', force); return; }
    // Keep earlier answers where the same question comes back.
    const prev = cur.plan?.answers || [];
    const picks: Record<number, number[]> = {};
    questions.forEach((q, qi) => {
      const a = prev.find(x => x.q === q.q);
      const chosen = a ? a.a.split(', ').map(t => q.options.indexOf(t)).filter(n => n >= 0) : [];
      if (chosen.length) picks[qi] = chosen;
    });
    setS({ qaSel: { ...S().qaSel, [id]: { picks, extra: '' } }, planOpen: [...S().planOpen.filter(x => x !== id), id] });
    write(() => updateDoc(itemRef(id), { planQ: { questions, at: Date.now(), by: me() } }));
  } catch (e) { toast((e as Error).message); }
}
async function makePlan(id: string, answers: PlanAnswer[], extra: string, open = false) {
  const ctx = await taskFor(id); if (!ctx) return;
  try {
    const data = await post('elaborate', { ...ctx, answers, extra });
    if (!S().items.some(i => i.id === id)) return;
    const plan = cleanPlan(data, me(), extra ? [...answers, { q: 'Verder', a: extra }] : answers);
    if (!plan.detail && !plan.steps.length && !plan.tips.length && !plan.buy.length) return;
    const { [id]: _, ...qaSel } = S().qaSel;
    // Worked out on its own: stays folded behind the chip. Asked for or answered: show it.
    setS({ qaSel, planOpen: open ? [...S().planOpen.filter(x => x !== id), id] : S().planOpen.filter(x => x !== id) });
    write(() => updateDoc(itemRef(id), { plan, planQ: null }));
  } catch (e) { toast((e as Error).message); }
}
/** Drop a worked-out plan (or open questions) the household does not want. */
export function removePlan(id: string) {
  setS({ planOpen: S().planOpen.filter(x => x !== id) });
  write(() => updateDoc(itemRef(id), { plan: null, planQ: null }));
}
export function planAddSteps(id: string) {
  const it = S().items.find(i => i.id === id); if (!it?.plan) return;
  const steps = it.plan.steps.map(st => ({ text: st.text, qty: '', note: '', cat: null, due: st.due || null }));
  if (!steps.length) return;
  addMany(it.listId, steps, `Onderdeel van: ${it.text}`.slice(0, 140));
  write(() => updateDoc(itemRef(id), { 'plan.stepsAdded': true }));
}
export function planAddBuy(id: string, listId: string) {
  const it = S().items.find(i => i.id === id); if (!it?.plan) return;
  const buy = it.plan.buy.map(b => ({ text: b.text, qty: b.qty || '', note: '', cat: null, due: null }));
  if (!buy.length) return;
  addMany(listId, buy, `Voor: ${it.text}`.slice(0, 140));
  write(() => updateDoc(itemRef(id), { 'plan.buyAdded': listId }));
}

export const togglePlanOpen = (id: string) =>
  setS({ planOpen: S().planOpen.includes(id) ? S().planOpen.filter(x => x !== id) : [...S().planOpen, id] });

export const today = todayISO;
export const CAT_OPTIONS = CATS.map(([id, label]) => ({ id, label }));

/* ---------- Aanbiedingen: supermarket offers for the household's woonplaats ----------
 * Normally a job looks them up every night (scripts/aanbiedingen.ts) and stores them on the household.
 * "Nu zoeken" does the same from the app, for when there is nothing yet. Gemini searches Google (grounding). */
export async function findOffers() {
  const h = S().households.find(x => x.id === S().hid);
  const p = (h?.place || '').trim();
  if (!h || !p) { toast('Vul eerst jullie woonplaats in bij Huishouden.'); return; }
  if (S().offersBusy) return;
  const shop = new Set(S().lists.filter(l => l.kind === 'shop').map(l => l.id));
  const open = S().items.filter(i => !i.done && shop.has(i.listId)).map(i => i.text).slice(0, 60);
  setS({ offersBusy: true });
  try {
    // Chosen supermarkets: one search each, so every chain gets its turn. Otherwise Gemini finds them itself.
    const chosen = (h.supermarkets || []).filter(Boolean);
    const ask = (stores?: string[]) => post<Record<string, unknown>>('offers', { place: p, open, memory: memoryForAi(), today: todayLong(), stores });
    // One supermarket at a time (several searches at once run into the AI limit), with one retry after a pause.
    const settled: PromiseSettledResult<Record<string, unknown>>[] = [];
    if (!chosen.length) settled.push({ status: 'fulfilled', value: await ask() });
    for (const s of chosen) {
      setS({ offersBusyAt: s });
      try { settled.push({ status: 'fulfilled', value: await ask([s]) }); }
      catch {
        await new Promise(r => setTimeout(r, 4000));
        try { settled.push({ status: 'fulfilled', value: await ask([s]) }); } catch (e) { settled.push({ status: 'rejected', reason: e }); }
      }
    }
    const missed = chosen.filter((_, n) => settled[n]?.status === 'rejected');
    // Per chosen supermarket, its offers carry exactly the name the household chose (not "AH" vs "Albert Heijn").
    const parts = settled.flatMap((r, n) => {
      if (r.status !== 'fulfilled') return [];
      const c = cleanOffers(r.value);
      return [{ raw: r.value, c: chosen[n] ? { ...c, stores: [chosen[n]], offers: c.offers.map(o => ({ ...o, store: chosen[n] })) } : c }];
    });
    if (!parts.length) throw new Error('Zoeken lukte niet. Probeer het zo opnieuw.');
    const raws = parts.map(x => x.raw);
    const c = mergeOffers(parts.map(x => x.c), chosen);
    const src = raws.flatMap(raw => (Array.isArray(raw?._sources) ? (raw!._sources as { title?: unknown; uri?: unknown }[]) : []));
    const sources = [...new Map(src.map(x => [String(x?.uri || ''), { title: String(x?.title || '').slice(0, 80), uri: String(x?.uri || '') }])).values()]
      .filter(x => /^https?:\/\//.test(x.uri)).slice(0, 12);
    const html = raws.map(r => r?._searchHtml).find(x => typeof x === 'string' && x) as string | undefined;
    const result: OfferResult = { place: p, ...c, sources, searchHtml: (html || '').slice(0, 20000), at: Date.now() };
    if (!S().readOnly) write(() => updateDoc(hRef(h.id), { offers: result }));
    if (!c.offers.length) toast(`Geen aanbiedingen gevonden voor ${p}.`);
    else if (missed.length) toast(`Bij ${missed.join(' en ')} lukte het zoeken niet; vannacht probeert Samenlijst het opnieuw.`);
  } catch (e) {
    toast((e as Error).message);
  } finally {
    setS({ offersBusy: false, offersBusyAt: null });
  }
}

/* ---------- Prijzen: what each grocery costs at the household's shops ----------
 * Gemini looks the prices up with Google: for supermarket items at the chosen supermarkets, for other items
 * (bouwmarkt, dierenwinkel) at such shops in the woonplaats. Every night for the whole list (scripts/aanbiedingen.ts),
 * a few seconds after something new is added, or on request (Aanbiedingen › Vernieuwen). */
export function priceStores(h = S().households.find(x => x.id === S().hid)): string[] {
  return (h?.supermarkets?.length ? h.supermarkets : h?.offers?.stores || []).filter(Boolean).slice(0, 12);
}

export async function lookupPrices(ids?: string[], opts: { quiet?: boolean } = {}) {
  const h = S().households.find(x => x.id === S().hid);
  const place = (h?.place || '').trim();
  if (!h || !place || !S().aiOn || S().readOnly) { if (!opts.quiet) toast('Vul eerst jullie woonplaats in bij Huishouden.'); return; }
  const shop = new Set(S().lists.filter(l => l.kind === 'shop').map(l => l.id));
  const items = S().items.filter(i => !i.done && shop.has(i.listId) && (!ids || ids.includes(i.id))).slice(0, 40);
  if (!items.length) return;
  const stores = priceStores(h);
  const supers = items.filter(i => isSuper(i.store)), others = items.filter(i => !isSuper(i.store));
  const found = new Map<string, ItemPrice[]>();
  const ask = async (batch: Item[], at: string[]) => {
    if (!batch.length) return;
    const raw = await post('prices', {
      place, stores: at, memory: memoryForAi(), today: todayLong(),
      items: batch.map(i => ({ text: i.text, qty: i.qty, note: i.note, store: isSuper(i.store) ? '' : i.store })),
    });
    const c = cleanPrices(raw, batch.length);
    batch.forEach((i, n) => { if (c[n]?.length) found.set(i.id, [...(found.get(i.id) || []), ...c[n]]); });
  };
  setS({ pricesBusy: true });
  let failed = 0;
  try {
    // A few items: one search for all shops. A whole list: one search per supermarket, so none is skipped.
    const jobs: [Item[], string[]][] = stores.length ? (supers.length <= 6 ? [[supers, stores]] : stores.map(st => [supers, [st]])) : [];
    jobs.push([others, []]);
    for (const [batch, at] of jobs) { try { await ask(batch, at); } catch (e) { console.warn('Prijzen', e); failed++; } }
    const now = Date.now();
    for (const i of items) {
      const got = found.get(i.id);
      if (!got) continue;
      // Keep earlier prices from shops this round did not ask (or did not find), replace the rest.
      const keep = (i.prices || []).filter(p => !got.some(g => sameStore(g.store, p.store)));
      const prices = [...got, ...keep].sort((a, b) => (a.amount ?? 1e9) - (b.amount ?? 1e9)).slice(0, 12);
      write(() => updateDoc(itemRef(i.id), { prices, pricesAt: now }));
    }
    if (!opts.quiet) toast(found.size ? `Prijzen gevonden voor ${found.size} van ${items.length} ${items.length === 1 ? 'item' : 'items'}` : 'Geen prijzen gevonden.');
    if (failed && !opts.quiet) toast('Niet elke winkel lukte; vannacht probeert Samenlijst het opnieuw.');
  } finally {
    setS({ pricesBusy: false });
  }
}

/** New groceries: look their prices up a few seconds later, together. */
let priceQueue: string[] = [], priceTimer: ReturnType<typeof setTimeout> | undefined;
export function queuePrices(id: string) {
  const h = S().households.find(x => x.id === S().hid);
  if (!h?.place?.trim() || !S().aiOn) return;
  priceQueue.push(id);
  clearTimeout(priceTimer);
  priceTimer = setTimeout(() => { const ids = priceQueue; priceQueue = []; void lookupPrices(ids, { quiet: true }); }, 5000);
}

/** "Ik ga boodschappen doen", optionally to a few supermarkets: the list is then grouped by where things are cheapest. */
export function startShopping(listId: string, stores: string[]) {
  write(() => updateDoc(listRef(listId), { shopper: { by: me(), at: Date.now(), stores: stores.slice(0, 6) } }));
  toast(stores.length ? `Op weg naar ${stores.join(' en ')}. De lijst staat per winkel.` : 'De anderen zien nu dat je boodschappen doet');
}
