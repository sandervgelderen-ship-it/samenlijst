/**
 * Elke nacht: de supermarktaanbiedingen van deze week, per huishouden met een woonplaats.
 *
 * Gemini zoekt met Google Search (via Firebase AI Logic, net als de webversie, dus zonder eigen sleutel) en het
 * resultaat komt op het huishouden te staan (samenlijstHouseholds/{id}.offers). De app toont het 's ochtends meteen:
 * de knop Aanbiedingen op een boodschappenlijst en een vlaggetje bij items die in de aanbieding zijn.
 *
 * Draait via de brug in GitHub Actions (die heeft de deploysleutel voor Firestore):
 *   GOOGLE_APPLICATION_CREDENTIALS=sa.json npx tsx scripts/aanbiedingen.ts <projectId> [uitvoermap]
 */
process.env.TZ = 'Europe/Amsterdam';

import fs from 'node:fs';
import path from 'node:path';
import { applicationDefault, initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { cleanOffers, groundingSources, parseLoose } from '../src/lib/aiClean';
import { memoryLines, todayLong } from '../src/lib/domain';
import { OFFERS_SHAPE, offersPrompt } from '../src/server/prompts';
import type { List, Memory, OfferResult } from '../src/types';

const [projectId, outDir = 'uit'] = process.argv.slice(2);
if (!projectId) throw new Error('Geef het project-id mee');
const webConfig = JSON.parse(fs.readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));

// The Firebase web key may only be allowed from the app's own site: say where we come from.
const baseFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (!headers.has('Referer')) headers.set('Referer', 'https://sandervgelderen-ship-it.github.io/samenlijst/');
  return baseFetch(input, { ...init, headers });
}) as typeof fetch;

const db = getFirestore(initAdmin({ credential: applicationDefault(), projectId }));
const ai = getAI(initializeApp(webConfig), { backend: new GoogleAIBackend() });
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
const missing = (e: unknown) => /404|not found|is not supported|no longer available|retired|deprecated/i.test(String((e as Error)?.message || e));

async function search(prompt: string) {
  let lastErr: unknown;
  for (const model of MODELS) {
    try {
      const m = getGenerativeModel(ai, { model, tools: [{ googleSearch: {} }] });
      return await m.generateContent(prompt);
    } catch (e) {
      lastErr = e;
      if (!missing(e)) break;
    }
  }
  throw lastErr;
}

const log: string[] = [];
const say = (line: string) => { console.log(line); log.push(line); };
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

const households = await db.collection('samenlijstHouseholds').get();
let done = 0, failed = 0, skipped = 0;
for (const h of households.docs) {
  const place = String(h.get('place') || '').trim();
  if (!place) { skipped++; continue; }
  try {
    const [listsSnap, itemsSnap, kbSnap] = await Promise.all([
      h.ref.collection('lists').get(),
      h.ref.collection('items').where('done', '==', false).get(),
      h.ref.collection('kb').where('kind', '==', 'rule').get(),
    ]);
    const lists = listsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as List);
    const shop = new Set(lists.filter(l => l.kind === 'shop').map(l => l.id));
    const open = itemsSnap.docs.map(d => d.data()).filter(i => shop.has(i.listId)).map(i => String(i.text || '')).filter(Boolean).slice(0, 60);
    const memory = memoryLines(kbSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Memory), lists);

    const prompt = `${offersPrompt({ place, open, memory, today: todayLong() })}\n\nAntwoord met alleen JSON in precies deze vorm (lege string als iets niet bekend is):\n${OFFERS_SHAPE}`;
    const result = await search(prompt);
    const meta = result.response.candidates?.[0]?.groundingMetadata;
    const c = cleanOffers(parseLoose(result.response.text()));
    if (!c.offers.length) {
      // Keep what was there: an empty answer is more often a hiccup than a week without offers.
      say(`${h.id} (${place}): geen aanbiedingen gevonden, vorige resultaat blijft staan`);
      failed++;
    } else {
      const offers: OfferResult = {
        place, ...c, sources: groundingSources(meta),
        searchHtml: String(meta?.searchEntryPoint?.renderedContent || '').slice(0, 20000), at: Date.now(),
      };
      await h.ref.update({ offers });
      const forList = c.offers.filter(o => o.match).length;
      say(`${h.id} (${place}): ${c.offers.length} aanbiedingen bij ${c.stores.join(', ') || '?'}, ${forList} voor de lijst${c.week ? ` (${c.week})` : ''}`);
      done++;
    }
  } catch (e) {
    say(`${h.id} (${place}): mislukt: ${String((e as Error)?.message || e).slice(0, 300)}`);
    failed++;
  }
  await pause(3000);
}
say(`Klaar: ${done} bijgewerkt, ${failed} zonder resultaat, ${skipped} zonder woonplaats`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'aanbiedingen.txt'), log.join('\n') + '\n');
// The Firebase SDKs keep connections open; this is a one-shot job.
process.exit(failed && !done ? 1 : 0);
