/**
 * AI without our own server: the web version (GitHub Pages) calls Gemini through
 * Firebase AI Logic, in the same Firebase project. No API key ends up in the site;
 * Firebase holds it. Uses the same prompts as the Express server (src/server/prompts.ts),
 * so both versions answer the same way.
 */
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app } from '../firebase';
import {
  analyzePrompt, elaboratePrompt, forgotPrompt, learnPrompt, offersPrompt, questionsPrompt, routePrompt, smartAddPrompt, sortPrompt, voicePrompt,
} from '../server/prompts';

// Newest stable model first; older ones only if a model is not available for this project.
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
let modelIndex = 0;
const models = new Map<string, ReturnType<typeof getGenerativeModel>>();
/** grounded = may search Google for current information; such answers come as text (no JSON mode with tools). */
function getModel(name: string, grounded = false) {
  const key = name + (grounded ? '+search' : '');
  let m = models.get(key);
  if (!m) {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    m = grounded
      ? getGenerativeModel(ai, { model: name, tools: [{ googleSearch: {} }] })
      : getGenerativeModel(ai, { model: name, generationConfig: { responseMimeType: 'application/json' } });
    models.set(key, m);
  }
  return m;
}
const modelMissing = (e: unknown) => /404|not found|is not supported|no longer available|retired|deprecated/i.test(String((e as Error)?.message || e));

async function generate(parts: (string | { inlineData: { mimeType: string; data: string } })[], grounded = false) {
  for (;;) {
    try {
      return await getModel(MODELS[modelIndex], grounded).generateContent(parts);
    } catch (e) {
      if (modelMissing(e) && modelIndex < MODELS.length - 1) { modelIndex++; continue; }
      throw e;
    }
  }
}

// Without a response schema, each prompt ends with the exact JSON shape we parse.
const SHAPE: Record<string, string> = {
  'analyze': '[{"i":0,"text":"Halfvolle melk","qty":"2 pak","note":"","cat":"zuivel","due":"","store":"Supermarkt","storeConfidence":0.95,"list":"<lijst-id>","confidence":0.95}]',
  'questions': '{"worth":true,"questions":[{"q":"Hoeveel kamers gaan er mee?","options":["1 of 2","3 of 4","5 of meer"],"multi":false}]}',
  'elaborate': '{"detail":"...","steps":[{"text":"Uitnodigingen versturen","due":""}],"tips":["..."],"buy":[{"text":"Slingers","qty":"2 st"}]}',
  'smart-add-shop': '[{"text":"Lasagnebladen","qty":"1 pak","cat":"houdbaar","pantry":false,"why":""}]',
  'smart-add-todo': '[{"text":"Verhuisdozen regelen","due":"","note":""}]',
  'forgot': '[{"text":"Pastasaus","qty":"1 pot","cat":"houdbaar","why":"Spaghetti staat erop, saus nog niet"}]',
  'sort-aisles': '[{"i":0,"cat":"zuivel"}]',
  'voice-memo': '{"transcript":"...","items":[{"text":"Melk","qty":"2 pak","due":""}]}',
  'route-items': '[{"i":0,"list":"<lijst-id>","confidence":0.9}]',
  'learn': '{"rules":[{"text":"Schoonmaakproducten moeten ecologisch zijn","topic":"Schoonmaak","list":""}]}',
  'offers': '{"week":"20 t/m 26 oktober","stores":["Albert Heijn","Jumbo"],"offers":[{"store":"Albert Heijn","product":"Halfvolle melk","deal":"2e halve prijs","price":"€1,19","until":"2026-10-26","match":"Melk","cat":"zuivel"}]}',
};

function media(dataUrl: unknown, kind: 'image' | 'audio') {
  if (typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(new RegExp(`^data:(${kind}/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$`, 'i'));
  return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
}

export async function runLocal(path: string, body: any): Promise<unknown> {
  let prompt = '', shape = SHAPE[path] || '';
  let attachment: ReturnType<typeof media> = null;
  switch (path) {
    case 'analyze': prompt = analyzePrompt(body); break;
    case 'questions': prompt = questionsPrompt(body); break;
    case 'elaborate': prompt = elaboratePrompt(body); break;
    case 'forgot': prompt = forgotPrompt(body); break;
    case 'sort-aisles': prompt = sortPrompt(body); break;
    case 'route-items': prompt = routePrompt(body); break;
    case 'learn': prompt = learnPrompt(body); break;
    case 'offers': return offers(body);
    case 'smart-add':
      attachment = media(body?.image, 'image');
      prompt = smartAddPrompt(body, !!attachment);
      shape = SHAPE[body?.kind === 'shop' ? 'smart-add-shop' : 'smart-add-todo'];
      break;
    case 'voice-memo':
      attachment = media(body?.audio, 'audio');
      if (!attachment) throw new Error('Er kwam geen opname mee. Probeer het opnieuw.');
      prompt = voicePrompt(body);
      break;
    default: throw new Error(`Onbekende AI-functie: ${path}`);
  }
  const text = `${prompt}\n\nAntwoord met alleen JSON in precies deze vorm (lege string als iets niet van toepassing is):\n${shape}`;
  const parts: (string | { inlineData: { mimeType: string; data: string } })[] = [text];
  if (attachment) parts.push(attachment);
  const result = await generate(parts);
  return parseLoose(result.response.text());
}

/** JSON from a model answer: the whole text, a ```json block, or the first {...} / [...] in it. */
function parseLoose(text: string): unknown {
  const out = String(text || '').trim();
  try { return JSON.parse(out); }
  catch {
    const m = out.match(/```(?:json)?\s*([\s\S]*?)```/) || out.match(/([\[{][\s\S]*[\]}])/);
    if (m) { try { return JSON.parse(m[1]); } catch { /* fall through */ } }
    return {};
  }
}

/** Supermarket offers: Gemini searches Google, so the answer is current; we keep the sources it used. */
async function offers(body: any) {
  if (!String(body?.place || '').trim()) throw new Error('Kies eerst een plaats.');
  const text = `${offersPrompt(body)}\n\nAntwoord met alleen JSON in precies deze vorm (lege string als iets niet bekend is):\n${SHAPE.offers}`;
  const result = await generate([text], true);
  const meta = result.response.candidates?.[0]?.groundingMetadata;
  const seen = new Set<string>();
  const sources: { title: string; uri: string }[] = [];
  for (const c of meta?.groundingChunks || []) {
    const uri = c.web?.uri || '';
    if (!/^https?:\/\//.test(uri) || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ title: String(c.web?.title || c.web?.domain || uri).slice(0, 80), uri });
    if (sources.length >= 8) break;
  }
  const data = parseLoose(result.response.text());
  const o = data && typeof data === 'object' && !Array.isArray(data) ? data : { offers: data };
  return { ...o, _sources: sources, _searchHtml: meta?.searchEntryPoint?.renderedContent || '' };
}
