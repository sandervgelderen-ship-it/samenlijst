/** Run with: npm test. Checks the list logic that quick add depends on. */
import assert from 'node:assert/strict';
import { parseEntry, parseDue, guessCat, prepEntry, route, splitEntries, learnEntry, kbKey } from '../src/lib/domain';
import { cleanAnalysis, cleanQuestions } from '../src/lib/aiClean';
import type { Item, KbEntry, List } from '../src/types';

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
const kb = new Map<string, KbEntry>();
const r = (s: string, ls = lists, items: Item[] = []) => route(prepEntry(s, ls, now), ls, items, kb);
t('melk -> boodschappen', () => assert.equal(r('2 pak melk').listId, 'bood'));
t('tandarts -> todo', () => assert.equal(r('tandarts bellen vrijdag').listId, 'todo'));
t('@todo kiest zelf', () => assert.equal(r('pindakaas @todo').listId, 'todo'));
t('schroeven -> vragen', () => assert.equal(r('schroeven').listId, null));

const three: List[] = [...lists, { id: 'klus', name: 'Bouwmarkt', kind: 'shop', createdAt: 3 }];
t('twee winkels: batterijen -> vragen', () => assert.equal(r('batterijen', three).listId, null));
t('twee winkels: melk uit geschiedenis', () => assert.equal(r('melk', three).listId, 'bood'));
const learned = learnEntry(undefined, 'Schroeven', 'klus', { weight: 2, by: 'u1', listIds: new Set(three.map(l => l.id)) })!;
kb.set(learned.key, learned);
t('na leren: schroeven -> bouwmarkt', () => assert.equal(r('schroeven', three).listId, 'klus'));
t('na leren: variant via fuzzy', () => assert.equal(r('schroeven 4mm', three).listId, 'klus'));
const corrected = learnEntry(kb.get('schroeven'), 'Schroeven', 'bood', { weight: 2, from: 'klus', by: 'u1', listIds: new Set(three.map(l => l.id)) })!;
t('correctie verschuift gewicht', () => assert.deepEqual(corrected.lists, { bood: 2 }));
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
t('vragen: dubbele opties weg, max 4', () => assert.deepEqual(qs.map(q => q.options.length), [3, 2, 2, 2]));
t('vragen: meerdere mogelijk', () => assert.deepEqual(qs.map(q => q.multi), [false, true, false, false]));

if (failed) { console.log(`\n${failed} test(s) mislukt`); process.exit(1); }
console.log('\nAlle tests geslaagd');
