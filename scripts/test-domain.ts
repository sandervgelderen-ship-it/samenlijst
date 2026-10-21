/** Run with: npm test. Checks the list logic that quick add depends on. */
import assert from 'node:assert/strict';
import { parseEntry, parseDue, guessCat, prepEntry, route, splitEntries, kbKey, normStore, isSuper, decideStore, storeOptions, pickCat, knownStore, parseRemember, isRule, makeMemory, memoryLines, liveOffers, offerItem, parseRepeat, nextDue, repeatLabel, parseEuro, cheapest, splitByStore, sameStore } from '../src/lib/domain';
import { cleanAnalysis, cleanOffers, cleanQuestions, cleanRules, mergeOffers } from '../src/lib/aiClean';
import type { Item, List } from '../src/types';

const now = new Date('2026-10-17T09:00:00'); // a Saturday
let failed = 0;
const t = (name: string, fn: () => void) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', (e as Error).message); } };

t('aantal vooraan', () => assert.deepEqual(parseEntry('2 pak melk'), { text: 'Melk', qty: '2 pak' }));
t('aantal achteraan', () => assert.deepEqual(parseEntry('melk 2x'), { text: 'Melk', qty: '2' }));
t('decimaal', () => assert.deepEqual(parseEntry('rijst 1,5 kg'), { text: 'Rijst', qty: '1,5 kg' }));
t('afdeling melk', () => assert.equal(guessCat('Melk'), 'zuivel'));
t('afdeling bananen', () => assert.equal(guessCat('Bananen'), 'groente'));
t('afdeling wc-papier', () => assert.equal(guessCat('Wc-papier'), 'huishouden'));
t('onbekend is overig', () => assert.equal(guessCat('Iets raars'), 'overig'));
t('vrijdag', () => assert.deepEqual(parseDue('tandarts bellen vrijdag', now), { text: 'Tandarts bellen', due: '2026-10-23' }));
t('morgen vooraan', () => assert.deepEqual(parseDue('Morgen pakket ophalen', now), { text: 'Pakket ophalen', due: '2026-10-18' }));
t('12 nov', () => assert.equal(parseDue('paspoort verlengen voor 12 nov', now).due, '2026-11-12'));
t('over 3 dagen', () => assert.equal(parseDue('over 3 dagen huur betalen', now).due, '2026-10-20'));
t('geen datum', () => assert.equal(parseDue('kaas', now).due, null));
t('splitsen met decimale komma', () => assert.deepEqual(splitEntries('melk, brood; 1,5 kg rijst\ntandarts bellen + kaas'), ['melk', 'brood', '1,5 kg rijst', 'tandarts bellen', 'kaas']));

const lists: List[] = [
  { id: 'bood', name: 'Boodschappen', kind: 'shop', recent: ['Melk'], createdAt: 1 },
  { id: 'todo', name: "Todo's", kind: 'todo', createdAt: 2 },
];
const r = (s: string, ls = lists, items: Item[] = []) => route(prepEntry(s, ls, now), ls, items);
t('melk -> boodschappen', () => assert.equal(r('2 pak melk').listId, 'bood'));
t('tandarts -> todo', () => assert.equal(r('tandarts bellen vrijdag').listId, 'todo'));
t('@todo kiest zelf', () => assert.equal(r('pindakaas @todo').listId, 'todo'));
t('schroeven -> vragen', () => assert.equal(r('schroeven').listId, null));

const three: List[] = [...lists, { id: 'klus', name: 'Bouwmarkt', kind: 'shop', createdAt: 3 }];
t('twee winkels: batterijen -> vragen', () => assert.equal(r('batterijen', three).listId, null));
t('twee winkels: melk uit geschiedenis', () => assert.equal(r('melk', three).listId, 'bood'));
const item = (p: Partial<Item>): Item => ({ id: 'i' + Math.random(), listId: 'bood', text: '', qty: '', note: '', cat: null, done: false, doneBy: null, doneAt: null, urgent: false, due: null, assignee: null, addedBy: null, createdAt: 1, ...p });
const hist = [item({ text: 'Schroeven', listId: 'klus', done: true, cat: 'overig', store: 'Gamma', createdAt: 5 })];
t('eerder op een lijst: schroeven -> bouwmarkt', () => assert.deepEqual([r('schroeven', three, hist).listId, r('schroeven', three, hist).why], ['klus', 'hist']));
t('afdeling: eerder gekozen gaat voor AI', () => assert.equal(pickCat('Havermelk', [item({ text: 'havermelk', cat: 'drinken', done: true })], 'zuivel'), 'drinken'));
t('afdeling: anders AI, dan gok', () => assert.deepEqual([pickCat('Havermelk', [], 'zuivel'), pickCat('Melk', [], null)], ['zuivel', 'zuivel']));
t('winkel: eerder gekocht bij', () => assert.deepEqual([knownStore('schroeven', hist), knownStore('melk', hist)], ['Bouwmarkt', null]));
t('kbKey', () => assert.equal(kbKey('Crème  fraîche!'), 'creme fraiche'));

const an = cleanAnalysis([
  { i: 0, text: 'halfvolle melk', qty: '2 pak', cat: 'zuivel', due: '', list: 'bood', confidence: 0.9 },
  { i: 0, text: 'Eieren', qty: '', cat: 'zuivel', due: '', list: 'bood', confidence: 0.9 },
  { i: 1, text: 'Kapper bellen', due: '2026-10-23', cat: '', list: 'todo', confidence: 1.4 },
  { i: 7, text: 'buiten bereik' }, { i: 1, text: '' },
], 2);
t('analyse: splitsen en hoofdletter', () => assert.deepEqual(an[0].map(a => a.text), ['Halfvolle melk', 'Eieren']));
t('analyse: datum en lege afdeling', () => assert.deepEqual([an[1][0].due, an[1][0].cat, an[1][0].confidence], ['2026-10-23', null, 1]));
t('analyse: onzin weg', () => assert.equal(Object.keys(an).length, 2));

const qs = cleanQuestions({ questions: [
  { q: 'Hoeveel kamers?', options: ['1 of 2', '3 of 4', '3 of 4', '5+'] },
  { q: 'Wie helpt?', options: ['Familie', 'Vrienden'], multi: true },
  { q: 'Te weinig', options: ['alleen'] },
  { question: 'Budget?', options: [{ label: '< 500' }, { text: '500-1000' }] },
  { q: 'Vijfde', options: ['a', 'b'] }, { q: 'Zesde', options: ['a', 'b'] },
] });
t('vragen: dubbele opties weg, max 3', () => assert.deepEqual(qs.map(q => q.options.length), [3, 2, 2]));
t('vragen: meerdere mogelijk', () => assert.deepEqual(qs.map(q => q.multi), [false, true, false]));

// Waar koop je het?
t('winkel: ketens worden soorten winkels', () => assert.deepEqual(['AH', 'jumbo', 'Gamma', 'kruidvat', 'De Intratuin', 'bol.com', 'Action', ''].map(normStore), ['Supermarkt', 'Supermarkt', 'Bouwmarkt', 'Drogist', 'Tuincentrum', 'Online', 'Action', null]));
t('winkel: supermarkt of niets is supermarkt', () => assert.deepEqual([isSuper(null), isSuper('albert heijn'), isSuper('Dierenwinkel')], [true, true, false]));
t('winkel: geleerd gaat voor AI', () => assert.deepEqual(decideStore('Dierenwinkel', { store: 'Supermarkt', conf: 0.95 }), { store: 'Dierenwinkel', ask: false, guess: null }));
t('winkel: zekere AI zonder vraag', () => assert.deepEqual(decideStore(null, { store: 'Supermarkt', conf: 0.95 }), { store: 'Supermarkt', ask: false, guess: null }));
t('winkel: twijfel geeft een vraag met gok', () => assert.deepEqual(decideStore(undefined, { store: 'dierenwinkel', conf: 0.5 }), { store: null, ask: true, guess: 'Dierenwinkel' }));
t('winkel: zonder AI geen vraag', () => assert.deepEqual(decideStore(null, null), { store: null, ask: false, guess: null }));
t('winkel: opties gok, supermarkt, eigen winkels', () => assert.deepEqual(storeOptions('Dierenwinkel', ['Action', 'Action', 'Gamma', null], 5), ['Dierenwinkel', 'Supermarkt', 'Action', 'Bouwmarkt', 'Drogist']));
const anStore = cleanAnalysis([{ i: 0, text: 'Stro', store: 'Dierenwinkel', storeConfidence: 0.55, list: 'bood', confidence: 0.9 }], 1);
t('analyse: winkel en zekerheid', () => assert.deepEqual([anStore[0][0].store, anStore[0][0].storeConf], ['Dierenwinkel', 0.55]));

// Geheugen: voorkeuren, geen losse items
t('onthoud: herkennen', () => assert.deepEqual(
  ['onthoud: schoonmaakproducten ecologisch', 'Onthoud dat we vegetarisch eten', 'onthoud koffie fairtrade', 'onthouden', 'melk'].map(parseRemember),
  ['Schoonmaakproducten ecologisch', 'We vegetarisch eten', 'Koffie fairtrade', null, null]));
t('regel of item', () => assert.deepEqual(
  ['Schoonmaakproducten moeten ecologisch zijn', 'Toiletreiniger', 'Melk → Boodschappen', 'Klusspullen horen op Klussen'].map(isRule),
  [true, false, false, true]));
const mem0 = { listIds: new Set(['klus']), source: 'geleerd' as const, by: 'u1', now: 7 };
t('geheugen: regel bewaren', () => assert.deepEqual(makeMemory('schoonmaakproducten moeten ecologisch zijn.', [], { ...mem0, topic: 'schoonmaak', list: 'x' }),
  { kind: 'rule', text: 'Schoonmaakproducten moeten ecologisch zijn', topic: 'Schoonmaak', list: null, source: 'geleerd', from: '', at: 7, by: 'u1' }));
t('geheugen: geen item, geen dubbele', () => assert.deepEqual([
  makeMemory('Toiletreiniger', [], mem0),
  makeMemory('Schoonmaakproducten moeten ecologisch zijn', [{ text: 'schoonmaakproducten moeten ecologisch zijn' }], mem0),
], [null, null]));
t('geheugen: zelf typen mag kort', () => assert.equal(makeMemory('Altijd bio', [], { ...mem0, source: 'zelf' })?.text, 'Altijd bio'));
t('geheugen: regels voor de AI', () => assert.deepEqual(
  memoryLines([{ text: 'Oud', list: null, at: 1 }, { text: 'Klusspullen op Klussen', list: 'klus', at: 2 }], three),
  ['Klusspullen op Klussen (lijst "Bouwmarkt", id "klus")', 'Oud']));
t('geleerde regels: items eruit', () => assert.deepEqual(
  cleanRules({ rules: [{ text: 'Toiletreiniger' }, { text: 'Schoonmaakproducten moeten ecologisch zijn.', topic: 'schoonmaak', list: '' }, { text: 'schoonmaakproducten moeten ecologisch zijn' }] }),
  [{ text: 'Schoonmaakproducten moeten ecologisch zijn', topic: 'Schoonmaak', list: null }]));

// Aanbiedingen
const offers = cleanOffers({ week: '20 t/m 26 oktober', stores: ['Jumbo'], offers: [
  { store: 'jumbo', product: 'chips', deal: '2e halve prijs', price: '€1,99', until: '2026-10-26', match: '', cat: 'snacks' },
  { store: 'Albert Heijn', product: 'halfvolle melk', deal: '1+1 gratis', price: '', until: 'zondag', match: 'melk' },
  { store: 'Jumbo', product: 'Chips', deal: 'dubbel' }, { store: '', product: 'zonder winkel' },
] });
t('aanbiedingen: lijst eerst, dubbel en leeg weg', () => assert.deepEqual(offers.offers.map(o => [o.store, o.product, o.match, o.until]), [['Albert Heijn', 'Halfvolle melk', 'Melk', null], ['Jumbo', 'Chips', '', '2026-10-26']]));
t('aanbiedingen: winkels en afdeling', () => assert.deepEqual([offers.stores, offers.offers[0].cat, offers.week], [['Jumbo', 'Albert Heijn'], 'zuivel', '20 t/m 26 oktober']));

const shopping = [item({ text: 'Melk' }), item({ text: 'Halfvolle melk' }), item({ text: 'Toiletreiniger' }), item({ text: 'Kaas' })];
t('aanbieding: Geminis match gaat voor', () => assert.equal(offerItem({ product: 'Campina Langlekker literpakken', match: 'melk' }, shopping)?.text, 'Melk'));
t('aanbieding: woorden van het item in het product', () => assert.deepEqual(
  ['AH Halfvolle melk 1 L', 'Ecover WC-reiniger', 'Ecover toiletreiniger 750 ml', 'Kaasstengels'].map(p => offerItem({ product: p, match: '' }, shopping)?.text ?? null),
  ['Halfvolle melk', null, 'Toiletreiniger', null]));
t('aanbieding: verlopen weg', () => assert.deepEqual(liveOffers([{ until: '2026-10-19' }, { until: '2026-10-20' }, { until: null }], '2026-10-20').length, 2));

// Terugkerende taken
const tue = new Date('2026-10-20T09:00');
t('herhalen: elke week', () => assert.deepEqual(parseRepeat('Konijnenhok schoonmaken elke week', tue), { text: 'Konijnenhok schoonmaken', repeat: { unit: 'week', n: 1 }, due: null }));
t('herhalen: elke 2 weken en om de dag', () => assert.deepEqual([parseRepeat('kliko buiten elke 2 weken', tue).repeat, parseRepeat('planten water om de dag', tue).repeat], [{ unit: 'week', n: 2 }, { unit: 'day', n: 2 }]));
t('herhalen: elke maandag geeft de eerste maandag', () => assert.deepEqual(parseRepeat('Groene bak buiten elke maandag', tue), { text: 'Groene bak buiten', repeat: { unit: 'week', n: 1 }, due: '2026-10-26' }));
t('herhalen: maandelijks, en gewone tekst niet', () => assert.deepEqual([parseRepeat('Huur overmaken maandelijks', tue).repeat, parseRepeat('Weekboodschappen doen', tue).repeat], [{ unit: 'month', n: 1 }, null]));
t('herhalen: volgende datum', () => assert.deepEqual([nextDue('2026-10-20', { unit: 'week', n: 1 }), nextDue('2026-01-31', { unit: 'month', n: 1 }), nextDue('2026-10-20', { unit: 'day', n: 3 })], ['2026-10-27', '2026-02-28', '2026-10-23']));
t('herhalen: label', () => assert.deepEqual([repeatLabel({ unit: 'week', n: 1 }), repeatLabel({ unit: 'week', n: 2 })], ['Elke week', 'Elke 2 weken']));

// Prijzen
t('prijs: euro lezen', () => assert.deepEqual(['€1,09', '2 voor €3,49', '€ 0.99 per kilo', '€3', 'gratis'].map(parseEuro), [1.09, 1.745, 0.99, 3, null]));
t('prijs: AH is Albert Heijn', () => assert.equal(sameStore('AH', 'Albert Heijn'), true));
const pr = (store: string, price: string) => ({ store, product: 'x', price, amount: parseEuro(price), deal: '', until: null });
const melk = { prices: [pr('Albert Heijn', '€1,19'), pr('Lidl', '€0,99'), pr('Vomar', '€1,05')], store: null };
t('prijs: goedkoopste, ook binnen gekozen winkels', () => assert.deepEqual([cheapest(melk.prices)!.store, cheapest(melk.prices, ['AH', 'Vomar'])!.store], ['Lidl', 'Vomar']));
const split = splitByStore([melk, { prices: [pr('AH', '€2,00')], store: null }, { prices: null, store: null }, { prices: null, store: 'Dierenwinkel' }], ['Albert Heijn', 'Vomar']);
t('prijs: per winkel groeperen', () => assert.deepEqual(split.map(([s, g]) => [s, g.length]), [['Albert Heijn', 2], ['Vomar', 1], ['Dierenwinkel', 1]]));
t('aanbieding: Appelsientje is geen appels', () => assert.equal(offerItem({ product: 'Appelsientje sinaasappelsap', match: 'Appels' }, [{ text: 'Appels' }]), undefined));
t('aanbieding: Elstar appels wel', () => assert.equal(offerItem({ product: 'Elstar appelen 1 kg', match: '' }, [{ text: 'Appels' }])?.text, 'Appels'));

// Aanbiedingen per gekozen supermarkt
const offA = cleanOffers({ week: '19 t/m 25 oktober', offers: [{ store: 'Vomar', product: 'Melk', deal: '1+1', match: 'Melk' }, { store: 'Vomar', product: 'Kaas', deal: '2e halve prijs' }] });
const offB = cleanOffers({ offers: [{ store: 'Lidl', product: 'Brood', deal: '25% korting' }, { store: 'Lidl', product: 'Melk', deal: '1+1' }] });
const merged = mergeOffers([offB, offA], ['Vomar', 'Lidl', 'Jumbo']);
t('aanbiedingen: winkels in gekozen volgorde, alleen met resultaat', () => assert.deepEqual(merged.stores, ['Vomar', 'Lidl']));
t('aanbiedingen: passend bij de lijst eerst, alles erin', () => assert.deepEqual([merged.offers[0].product, merged.offers.length, merged.week], ['Melk', 4, '19 t/m 25 oktober']));
const many = mergeOffers(['Albert Heijn', 'Vomar', 'Lidl'].map(st => cleanOffers({ offers: Array.from({ length: 40 }, (_, n) => ({ store: st, product: `${st} ${n}`, deal: '1+1' })) })), ['Albert Heijn', 'Vomar', 'Lidl']);
t('aanbiedingen: om de beurt per winkel, niemand valt weg', () => assert.deepEqual([many.offers.slice(0, 3).map(o => o.store), many.offers.filter(o => o.store === 'Lidl').length > 25], [['Albert Heijn', 'Vomar', 'Lidl'], true]));

if (failed) { console.log(`\n${failed} test(s) mislukt`); process.exit(1); }
console.log('\nAlle tests geslaagd');
