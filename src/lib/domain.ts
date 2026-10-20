/**
 * Pure list logic: Dutch supermarket aisles, quantity and date parsing,
 * the routing score that decides which list a quick-added entry goes to,
 * and the household memory (general preferences, never single items).
 * No Firebase, no React: tested in scripts/test-domain.ts.
 */
import type { CatId, ColorName, Entry, Item, List, Memory, Offer, RouteWhy } from '../types';

/* ---------- Aisles ---------- */
export const CATS: [CatId, string, string][] = [
  ['groente', 'Groente & fruit', 'appel appels peer peren banaan bananen sinaasappel mandarijn citroen citroenen limoen limoenen druif druiven aardbei aardbeien framboos frambozen bessen blauwe mango ananas kiwi meloen avocado tomaat tomaten cherrytomaat komkommer paprika ui uien rode ui knoflook aardappel aardappelen krieltjes wortel wortels winterpeen broccoli bloemkool spinazie sla ijsbergsla rucola veldsla courgette aubergine prei champignon champignons paddenstoelen gember peterselie basilicum koriander bieten sperziebonen boontjes spruitjes andijvie zoete aardappel pompoen lente-ui bosui taugé radijs selderij venkel fruit groente salade'],
  ['brood', 'Brood & ontbijt', 'brood bruinbrood volkoren witbrood bolletjes broodjes croissant croissants beschuit crackers knäckebröd ontbijtkoek hagelslag vlokken pindakaas jam muesli cornflakes havermout granola wraps tortilla stokbrood krentenbollen honing chocopasta ontbijt rijstwafels'],
  ['zuivel', 'Zuivel & eieren', 'melk halfvolle volle karnemelk yoghurt griekse kwark vla boter roomboter room slagroom kookroom eieren ei margarine halvarine crème fraîche creme fraiche zure havermelk sojamelk amandelmelk toetje skyr chocolademelk'],
  ['kaas', 'Kaas & beleg', 'kaas jonge belegen oude geraspte mozzarella feta parmezaan parmigiano brie camembert geitenkaas ham salami kipfilet-beleg rookvlees filet americain leverworst vleeswaren smeerkaas hummus zalmsalade beleg'],
  ['vlees', 'Vlees, vis & vega', 'kip kipfilet kippendijen drumsticks gehakt rundergehakt rundvlees biefstuk varkensvlees speklappen spekjes spek bacon worst rookworst saucijzen braadworst hamburger hamburgers schnitzel zalm tonijn garnalen vis kabeljauw pangasius tofu tempeh vegaburger vegetarische falafel shoarma kebab vlees gyros'],
  ['houdbaar', 'Pasta, rijst & voorraad', 'pasta spaghetti macaroni penne fusilli lasagne rijst basmati noedels mie bami couscous bulgur quinoa bloem meel suiker zout peper olie olijfolie zonnebloemolie azijn tomatenpuree passata pastasaus saus pesto ketchup mayonaise mayo mosterd sojasaus ketjap bouillon bouillonblokjes kruiden specerijen bonen kidneybonen kikkererwten linzen mais blik soep curry kokosmelk bakpoeder gist paneermeel rozijnen'],
  ['diepvries', 'Diepvries', 'diepvries ijs ijsjes pizza friet patat vissticks diepvriesgroente doperwten spinazie-diepvries bladerdeeg kroketten frikandellen bitterballen'],
  ['drinken', 'Drinken', 'water spa bruisend bier pils wijn rode witte rosé frisdrank cola fanta sprite sap jus appelsap sinaasappelsap limonade siroop ranja koffie koffiebonen koffiepads cups thee ijsthee tonic prosecco energiedrank'],
  ['snacks', 'Snoep & snacks', 'chips koek koekjes chocola chocolade reep snoep drop nootjes noten pinda pindas popcorn stroopwafels cake taart borrelnootjes zoutjes kaasstengels toffees'],
  ['huishouden', 'Huishouden', 'wc-papier toiletpapier wc papier keukenrol afwasmiddel vaatwastabletten vaatwasblokjes wasmiddel wasverzachter schoonmaakmiddel allesreiniger vuilniszakken afvalzakken pedaalemmerzakken bleek sponsjes spons aluminiumfolie huishoudfolie bakpapier batterijen lampje kaarsen servetten theedoek ontkalker glorix'],
  ['verzorging', 'Verzorging & baby', 'tandpasta tandenborstel shampoo conditioner douchegel zeep handzeep deodorant deo scheermesjes scheerschuim maandverband tampons luiers billendoekjes babyvoeding zonnebrand bodylotion crème paracetamol ibuprofen pleisters watjes wattenstaafjes mondwater haargel'],
  ['overig', 'Overig', ''],
];
export const CAT_IDS = CATS.map(c => c[0]);
export const CAT_LABEL = Object.fromEntries(CATS.map(c => [c[0], c[1]])) as Record<CatId, string>;
export const CAT_ORDER = Object.fromEntries(CATS.map((c, i) => [c[0], i])) as Record<CatId, number>;
export const AISLE_COLOR: Partial<Record<CatId, ColorName>> = {
  groente: 'munt', brood: 'zon', zuivel: 'lucht', kaas: 'zon', vlees: 'tomaat', houdbaar: 'druif',
  diepvries: 'lucht', drinken: 'lucht', snacks: 'roze', huishouden: 'druif', verzorging: 'roze',
};
export const isCat = (c: unknown): c is CatId => typeof c === 'string' && (CAT_IDS as string[]).includes(c);

const KEYWORDS: [string, CatId][] = [];
CATS.forEach(([id, , words]) => words.split(' ').filter(Boolean).forEach(w => KEYWORDS.push([w, id])));

export const COMMON = ['Melk', 'Brood', 'Eieren', 'Kaas', 'Boter', 'Bananen', 'Appels', 'Tomaten', 'Komkommer', 'Paprika', 'Uien', 'Knoflook', 'Aardappelen', 'Wortels', 'Sla', 'Yoghurt', 'Kwark', 'Kipfilet', 'Gehakt', 'Zalm', 'Pasta', 'Rijst', 'Pastasaus', 'Olijfolie', 'Koffie', 'Thee', 'Water', 'Sinaasappelsap', 'Pindakaas', 'Hagelslag', 'Jam', 'Muesli', 'Havermout', 'Chips', 'Koekjes', 'Chocolade', 'Wc-papier', 'Keukenrol', 'Afwasmiddel', 'Vaatwastabletten', 'Wasmiddel', 'Tandpasta', 'Shampoo', 'Douchegel', 'Vuilniszakken', 'Wraps', 'Avocado', 'Citroen', 'Broccoli', 'Spinazie', 'Champignons', 'Ham', 'Mozzarella', 'Slagroom', 'Bier', 'Wijn', 'Diepvriespizza', 'Ijs', 'Luiers'];

/* ---------- Text helpers ---------- */
export const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const kbKey = (text: string) => norm(String(text || '')).replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim();

export function guessCat(text: string): CatId {
  const t = norm(text);
  const words = t.split(/[\s\-,]+/);
  let best: CatId | null = null, bestLen = 0;
  for (const [kw, id] of KEYWORDS) {
    const k = norm(kw);
    const hit = k.length <= 3 ? words.includes(k)
      : k.includes(' ') ? t.includes(k)
      : words.some(w => w.startsWith(k) || (k.length >= 5 && w.includes(k)));
    if (hit && k.length > bestLen) { best = id; bestLen = k.length; }
  }
  return best || 'overig';
}

type Known = Pick<Item, 'text' | 'cat' | 'createdAt'> & { store?: string | null };
/** The newest item with the same name that the household already had: its aisle or shop is what they chose before. */
function lastSame(text: string, history: Known[], has: (i: Known) => boolean): Known | undefined {
  const key = kbKey(text);
  let best: Known | undefined;
  for (const i of history) if (kbKey(i.text) === key && has(i) && (!best || (i.createdAt || 0) > (best.createdAt || 0))) best = i;
  return best;
}

/** Aisle for an item: the aisle it had before on the lists wins, then the AI's aisle, then the keyword guess. */
export function pickCat(text: string, history: Known[], aiCat?: CatId | null): CatId {
  const e = lastSame(text, history, i => isCat(i.cat) && i.cat !== 'overig');
  if (e) return e.cat as CatId;
  if (aiCat && isCat(aiCat) && aiCat !== 'overig') return aiCat;
  return guessCat(text);
}

/** Aisle for an item without AI: the aisle it had before wins over the keyword guess. */
export function catFor(text: string, history: Known[]): CatId {
  return pickCat(text, history, null);
}

/** Where the household bought this item before (from the lists themselves), if anywhere. */
export function knownStore(text: string, history: Known[]): string | null {
  return normStore(lastSame(text, history, i => !!normStore(i.store))?.store);
}

const UNITS = 'x|st|stuks?|kg|kilo|g|gr|gram|l|liter|ml|pak|pakken|zak|zakken|blik|blikken|fles|flessen|pot|potten|bos|bossen|doos|dozen|krat|kratten|tros|net|bak|bakjes?|rol|rollen';
/** "2 pak melk", "melk 2x", "rijst 1,5 kg" -> { qty, text } */
export function parseEntry(raw: string): { text: string; qty: string } {
  let s = raw.trim().replace(/\s+/g, ' ');
  let qty = '';
  let m = s.match(new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(' + UNITS + ')?\\.?\\s+(.+)$', 'i'));
  if (m) { qty = (m[1] + (m[2] ? ' ' + m[2] : '')).trim(); s = m[3]; }
  else if ((m = s.match(/^(.+?)\s+(\d+)\s*x$/i))) { qty = m[2]; s = m[1]; }
  else if ((m = s.match(new RegExp('^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(' + UNITS + ')$', 'i')))) { qty = m[2] + ' ' + m[3]; s = m[1]; }
  if (/^\d+\s*x$/i.test(qty)) qty = qty.replace(/\s*x$/i, '');
  return { text: cap(s).slice(0, 120), qty: qty.slice(0, 24) };
}

/* ---------- Dates ---------- */
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayISO = (now = new Date()) => isoOf(now);
export const todayLong = (now = new Date()) =>
  now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' (' + todayISO(now) + ')';

const WD = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MON = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** Plain Dutch dates: "morgen", "vrijdag", "volgende week", "over 3 dagen", "12 nov", "12-11". */
export function parseDue(text: string, nowIn = new Date()): { text: string; due: string | null } {
  const now = new Date(nowIn); now.setHours(12, 0, 0, 0);
  const add = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
  const dm = (day: number, mon: number, yr: number) => {
    const y = yr ? (yr < 100 ? 2000 + yr : yr) : now.getFullYear();
    let d = new Date(y, mon, day, 12);
    if (!yr && d < add(-14)) d = new Date(y + 1, mon, day, 12);
    return d.getMonth() === mon ? d : null;
  };
  const P = '(?:^|\\s)(?:voor\\s|op\\s|uiterlijk\\s)?';
  const rules: [RegExp, (m: RegExpMatchArray) => Date | null][] = [
    [new RegExp(P + 'overmorgen(?=\\s|$)', 'i'), () => add(2)],
    [new RegExp(P + 'vandaag(?=\\s|$)', 'i'), () => add(0)],
    [new RegExp(P + 'morgen(?=\\s|$)', 'i'), () => add(1)],
    [new RegExp(P + '(?:dit\\s)?weekend(?=\\s|$)', 'i'), () => add((6 - now.getDay() + 7) % 7)],
    [new RegExp(P + 'volgende\\sweek(?=\\s|$)', 'i'), () => add(((1 - now.getDay() + 7) % 7) || 7)],
    [new RegExp(P + 'over\\s(\\d{1,2})\\sdag(?:en)?(?=\\s|$)', 'i'), m => add(+m[1])],
    [new RegExp(P + 'over\\s(\\d{1,2})\\sweken?(?=\\s|$)', 'i'), m => add(7 * +m[1])],
    [new RegExp(P + '(?:aanstaande\\s|volgende\\s)?(' + WD.join('|') + ')(?:\\sa\\.s\\.)?(?=\\s|$)', 'i'), m => add(((WD.indexOf(m[1].toLowerCase()) - now.getDay() + 7) % 7) || 7)],
    [new RegExp(P + '(\\d{1,2})\\s(' + MON.join('|') + '|maart)[a-z]*\\.?(?:\\s(\\d{4}))?(?=\\s|$)', 'i'), m => dm(+m[1], m[2].toLowerCase() === 'maart' ? 2 : MON.indexOf(m[2].toLowerCase().slice(0, 3)), m[3] ? +m[3] : 0)],
    [new RegExp(P + '(\\d{1,2})[-/](\\d{1,2})(?:[-/](\\d{2,4}))?(?=\\s|$)'), m => (+m[2] >= 1 && +m[2] <= 12 ? dm(+m[1], +m[2] - 1, m[3] ? +m[3] : 0) : null)],
  ];
  for (const [re, fn] of rules) {
    const m = text.match(re);
    if (!m || m.index === undefined) continue;
    const d = fn(m);
    if (!d || isNaN(+d)) continue;
    const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
    return { text: cap(rest) || cap(text), due: isoOf(d) };
  }
  return { text, due: null };
}

export function dueInfo(due: string, now = new Date()): { label: string; late?: boolean; soon?: boolean } {
  const d0 = new Date(todayISO(now) + 'T00:00'), d1 = new Date(due + 'T00:00');
  const diff = Math.round((+d1 - +d0) / 864e5);
  if (diff < 0) return { label: diff === -1 ? 'Gisteren' : `${-diff} dagen te laat`, late: true };
  if (diff === 0) return { label: 'Vandaag', soon: true };
  if (diff === 1) return { label: 'Morgen', soon: true };
  if (diff < 7) return { label: d1.toLocaleDateString('nl-NL', { weekday: 'long' }) };
  return { label: d1.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) };
}

/* ---------- Routing ---------- */
const TODO_WORDS = new Set(('bellen mailen appen regelen maken ophalen wegbrengen terugbrengen brengen betalen plannen boeken reserveren repareren fixen schoonmaken opruimen stofzuigen dweilen poetsen wassen strijken verven opzeggen aanvragen inleveren versturen sturen opsturen afspreken invullen checken controleren nakijken vervangen ophangen monteren uitzoeken sorteren legen buitenzetten uitlaten voeren snoeien maaien organiseren voorbereiden aanmelden afmelden opzoeken printen bestellen terugsturen retourneren declareren overmaken verlengen ' +
  'afspraak tandarts huisarts dokter kapper garage apk belasting belastingaangifte verzekering factuur rekening gemeente paspoort rijbewijs verjaardag cadeau school ouderavond zwemles').split(' '));
export const isTodoish = (text: string) => kbKey(text).split(' ').some(w => TODO_WORDS.has(w));

export function findList(name: string, lists: List[]): string | null {
  const n = norm(name).replace(/[^a-z0-9]/g, '');
  if (!n) return null;
  const l = lists.find(l => norm(l.name).replace(/[^a-z0-9]/g, '').startsWith(n));
  return l ? l.id : null;
}

export const splitEntries = (raw: string) => raw.split(/\n|;|,(?!\d)|\s\+\s/).map(s => s.trim()).filter(Boolean).slice(0, 25);

let pidSeq = 0;
/** One typed piece of a quick add: "@lijst" choice, quantity and a date pulled out. */
export function prepEntry(part: string, lists: List[], now = new Date()): Entry {
  let s = part, explicit: string | null = null;
  const m = s.match(/(^|\s)@(\S+)/);
  if (m && m.index !== undefined) {
    explicit = findList(m[2], lists);
    if (explicit) s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim();
  }
  const pe = parseEntry(s);
  const pd = parseDue(pe.text, now);
  return { pid: `p${Date.now().toString(36)}${pidSeq++}`, raw: s, qty: pe.qty, text: cap(pd.text), due: pd.due, hasDate: !!pd.due, key: kbKey(pd.text), explicit, note: '', cat: null };
}

export interface RouteResult { listId: string | null; ranking: string[]; guess?: string | null; why: RouteWhy }

/** Score every list for one entry; only route automatically when the evidence clearly points one way. */
export function route(p: Entry, lists: List[], items: Item[]): RouteResult {
  const ids = lists.map(l => l.id);
  const has = new Set(ids);
  if (!lists.length) return { listId: null, ranking: [], why: 'nolists' };
  if (p.explicit && has.has(p.explicit)) return { listId: p.explicit, ranking: [p.explicit], why: 'explicit' };
  for (const i of items) if (!i.done && has.has(i.listId) && kbKey(i.text) === p.key) return { listId: i.listId, ranking: [i.listId], why: 'dup' };
  if (lists.length === 1) return { listId: ids[0], ranking: ids, why: 'only' };

  const sc: Record<string, number> = {};
  let hist = false;
  const bump = (id: string, v: number) => { if (has.has(id) && v > 0) sc[id] = (sc[id] || 0) + v; };
  // What the lists themselves show: it was on a list before (recently cleared or ticked off).
  for (const l of lists) if ((l.recent || []).some(t => kbKey(t) === p.key)) { bump(l.id, 3); hist = true; }
  for (const i of items) if (i.done && kbKey(i.text) === p.key) { bump(i.listId, 3); hist = true; }
  const todoish = isTodoish(p.text) || p.hasDate;
  if (!todoish && guessCat(p.text) !== 'overig') lists.filter(l => l.kind === 'shop').forEach(l => bump(l.id, 1.5));
  if (todoish) lists.filter(l => l.kind === 'todo').forEach(l => bump(l.id, p.hasDate ? 2 : 1.5));

  const ranked = Object.keys(sc).sort((a, b) => sc[b] - sc[a]);
  const ranking = [...ranked, ...ids.filter(id => !sc[id])];
  if (!ranked.length) return { listId: null, ranking, why: 'unknown' };
  const top = sc[ranked[0]], sum = ranked.reduce((s, id) => s + sc[id], 0);
  const sure = (ranked.length === 1 && top >= 1.5) || (top >= 3 && top / sum >= 0.75);
  return { listId: sure ? ranked[0] : null, ranking, guess: ranked[0], why: hist ? 'hist' : 'rule' };
}

/* ---------- Geheugen: general preferences, never single items ---------- */
/** "onthoud: schoonmaakmiddel altijd ecologisch" typed in the add bar: the rule to remember, or null. */
export function parseRemember(raw: string): string | null {
  const m = String(raw || '').trim().match(/^(?:onthoud|onthou|geheugen|voorkeur)\s*(?:[:\-–]\s*|dat\s+|\s)(.+)$/i);
  const t = m ? m[1].trim() : '';
  return t.length >= 3 ? cap(t).slice(0, 160) : null;
}

/**
 * Is this a general rule rather than a single product or task? A rule says something about a kind of
 * thing ("Schoonmaakproducten moeten ecologisch zijn"); "Toiletreiniger" or "Melk → Boodschappen" is an item.
 */
export function isRule(text: string): boolean {
  const t = String(text || '').trim();
  if (t.length < 8 || t.length > 160) return false;
  if (/(→|->|=>)/.test(t)) return false;
  return kbKey(t).split(' ').filter(Boolean).length >= 3;
}

/** A clean memory entry, or null when it is not a rule or the memory already says it. */
export function makeMemory(
  text: unknown, existing: Pick<Memory, 'text'>[],
  opts: { topic?: unknown; list?: unknown; listIds: Set<string>; source: Memory['source']; from?: string; by: string | null; now?: number },
): Omit<Memory, 'id'> | null {
  const t = cap(String(text ?? '').trim().replace(/\s+/g, ' ').replace(/[.]+$/, '')).slice(0, 160);
  if (!isRule(t) && !(opts.source === 'zelf' && t.length >= 3)) return null;
  const key = kbKey(t);
  if (existing.some(m => kbKey(m.text) === key)) return null;
  const list = typeof opts.list === 'string' && opts.listIds.has(opts.list) ? opts.list : null;
  return {
    kind: 'rule', text: t, topic: cap(String(opts.topic ?? '').trim()).slice(0, 30), list,
    source: opts.source, from: String(opts.from || '').slice(0, 300), at: opts.now ?? Date.now(), by: opts.by,
  };
}

/** The memory as lines for a prompt, newest first. */
export function memoryLines(memory: Pick<Memory, 'text' | 'list' | 'at'>[], lists: Pick<List, 'id' | 'name'>[], max = 40): string[] {
  return [...memory].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, max).map(m => {
    const l = m.list ? lists.find(x => x.id === m.list) : null;
    return l ? `${m.text} (lijst "${l.name}", id "${l.id}")` : m.text;
  });
}

/* ---------- Where to buy it ---------- */
export const SUPERMARKT = 'Supermarkt';
/** Dutch supermarket chains to pick from for the offers. */
export const CHAINS = ['Albert Heijn', 'Jumbo', 'Lidl', 'Aldi', 'Plus', 'Dirk', 'Vomar', 'DekaMarkt', 'Hoogvliet', 'Coop', 'Spar', 'Poiesz', 'Ekoplaza', 'Picnic'];
export const STORES = [SUPERMARKT, 'Drogist', 'Bouwmarkt', 'Tuincentrum', 'Dierenwinkel', 'Apotheek', 'Slager', 'Bakker', 'Markt', 'Online'];
const STORE_ALIASES: [RegExp, string][] = [
  [/^(supermarkt|super|ah|albert heijn|jumbo|lidl|aldi|plus|dirk|coop|spar|vomar|dekamarkt|hoogvliet|picnic|crisp)$/, SUPERMARKT],
  [/^(drogist(erij)?|kruidvat|etos|trekpleister|da)$/, 'Drogist'],
  [/^(bouwmarkt|gamma|praxis|karwei|hornbach|hubo|bauhaus|doe-het-zelf(zaak)?|ijzerwaren(winkel)?)$/, 'Bouwmarkt'],
  [/^(tuincentrum|intratuin|groenrijk|tuinwinkel)$/, 'Tuincentrum'],
  [/^(dierenwinkel|dierenspeciaalzaak|dierenzaak|pets place|jumper|dierenspeciaal)$/, 'Dierenwinkel'],
  [/^(apotheek)$/, 'Apotheek'],
  [/^(slager|slagerij)$/, 'Slager'],
  [/^(bakker|bakkerij)$/, 'Bakker'],
  [/^(markt|weekmarkt)$/, 'Markt'],
  [/^(online|internet|bol|bol\.com|webshop|amazon)$/, 'Online'],
];
/** One name per kind of shop: "AH" and "jumbo" are the supermarket, "Gamma" the bouwmarkt; others keep their name. */
export function normStore(s: unknown): string | null {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
  if (!t) return null;
  const k = norm(t).replace(/^(de|het|een)\s+/, '');
  for (const [re, name] of STORE_ALIASES) if (re.test(k)) return name;
  return cap(t);
}
export const isSuper = (store: string | null | undefined) => !store || normStore(store) === SUPERMARKT;

/**
 * Where an item is bought. What the household told us wins; then a confident AI; when the AI doubts
 * (or thinks it is not the supermarket, without being sure) we ask. Without any signal: supermarket, no question.
 */
export function decideStore(known: string | null | undefined, ai: { store?: string | null; conf?: number } | null, minConf = 0.8):
  { store: string | null; ask: boolean; guess: string | null } {
  const k = normStore(known);
  if (k) return { store: k, ask: false, guess: null };
  const g = normStore(ai?.store);
  if (!ai || !g) return { store: null, ask: false, guess: null };
  if ((ai.conf ?? 0) >= minConf) return { store: g, ask: false, guess: null };
  return { store: null, ask: true, guess: g };
}

/** Answer chips for "Waar koop je dit?": the guess first, then the supermarket, then shops this household uses. */
export function storeOptions(guess: string | null, used: (string | null | undefined)[], max = 5): string[] {
  const out: string[] = [];
  const add = (s: string | null | undefined) => { const n = normStore(s); if (n && !out.includes(n) && out.length < max) out.push(n); };
  add(guess); add(SUPERMARKT);
  const counts = new Map<string, number>();
  used.forEach(u => { const n = normStore(u); if (n) counts.set(n, (counts.get(n) || 0) + 1); });
  [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([n]) => add(n));
  STORES.forEach(add);
  return out;
}

/* ---------- Aanbiedingen ---------- */
/** Offers still valid today (no end date = valid for the folder week). */
export function liveOffers<T extends Pick<Offer, 'until'>>(offers: T[] | undefined, today = todayISO()): T[] {
  return (offers || []).filter(o => !o.until || o.until >= today);
}

/**
 * The item on the list an offer is for: the item Gemini named, or an item whose words all appear in the
 * product ("Halfvolle melk" in "AH halfvolle melk 1 L"). The list changes during the day, so this is checked live.
 */
export function offerItem<T extends Pick<Item, 'text'>>(o: Pick<Offer, 'product' | 'match'>, items: T[]): T | undefined {
  const mk = kbKey(o.match || '');
  if (mk) { const hit = items.find(i => kbKey(i.text) === mk); if (hit) return hit; }
  const pw = kbKey(o.product).split(/[\s-]+/).filter(w => w.length >= 4);
  // A word of the item is in the product as a word, or (5+ letters) as part of one: "toiletreiniger" in "wc-toiletreiniger".
  const has = (w: string) => pw.some(p => p === w || (w.length >= 5 && (p.startsWith(w) || p.endsWith(w))));
  let best: T | undefined, bestLen = 0;
  for (const i of items) {
    const iw = kbKey(i.text).split(/[\s-]+/).filter(w => w.length >= 4);
    // The most specific item wins: "Halfvolle melk" over "Melk".
    if (iw.length > bestLen && iw.every(has)) { best = i; bestLen = iw.length; }
  }
  return best;
}

/* ---------- Look ---------- */
export const COLORS: ColorName[] = ['tomaat', 'munt', 'lucht', 'zon', 'druif', 'roze'];
export const COLOR_NAME: Record<ColorName, string> = { tomaat: 'Tomaat', munt: 'Munt', lucht: 'Lucht', zon: 'Zon', druif: 'Druif', roze: 'Roze' };
export function colorOf(l: Pick<List, 'id' | 'color'> | undefined): ColorName {
  if (l && l.color && COLORS.includes(l.color)) return l.color;
  let h = 0; const k = String(l?.id || '');
  for (let n = 0; n < k.length; n++) h = (h * 31 + k.charCodeAt(n)) >>> 0;
  return COLORS[h % COLORS.length];
}
export function greetingPart(now = new Date()) {
  const h = now.getHours();
  return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
}
